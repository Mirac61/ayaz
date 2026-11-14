#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK_DIR="/tmp/ayaz-agent.lock"
WORKTREE_BASE="$REPO_ROOT/../ayaz-agent-worktrees"
QUESTIONS_FILE="$REPO_ROOT/QUESTIONS.md"
MAX_TASKS_PER_NIGHT="${1:-2}"
TASKS_DONE=0

# 1. Atomares Lock (verhindert doppelte Ausführung)
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Ein anderer Agent-Lauf ist noch aktiv ($LOCK_DIR). Breche ab."
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT INT TERM

cd "$REPO_ROOT"
git fetch origin dev

# Alle offenen TODO-IDs aufsteigend holen
TODO_IDS=$(waypoint -p --json | jq -r '[.tasks[] | select(.status=="TODO")] | sort_by(.id|tonumber) | .[].id')

if [ -z "$TODO_IDS" ]; then
  echo "Keine offenen TODO-Tasks in .waypoint.json."
  exit 0
fi

for TARGET_ID in $TODO_IDS; do
  if [ "$TASKS_DONE" -ge "$MAX_TASKS_PER_NIGHT" ]; then
    echo "Tageslimit ($MAX_TASKS_PER_NIGHT Tasks) erreicht. Stoppe für heute."
    break
  fi

  TASK_JSON=$(waypoint -p --json | jq -c ".tasks[] | select(.id==\"$TARGET_ID\")")
  TASK_TITLE=$(echo "$TASK_JSON" | jq -r '.title')
  echo "---> Starte Task #$TARGET_ID: $TASK_TITLE"

  # Task lokal im Haupt-Repo als IN_PROGRESS markieren
  waypoint task start "$TARGET_ID"

  WORKTREE_DIR="$WORKTREE_BASE/task-$TARGET_ID"
  BRANCH_NAME="feat/task-$TARGET_ID"
  PR_BODY_FILE="/tmp/ayaz-pr-$TARGET_ID.md"
  QUESTION_OUT="/tmp/ayaz-question-$TARGET_ID.md"
  LOG_FILE="/tmp/ayaz-run-$TARGET_ID.log"

  rm -f "$PR_BODY_FILE" "$QUESTION_OUT" "$LOG_FILE"
  git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
  git branch -D "$BRANCH_NAME" 2>/dev/null || true

  mkdir -p "$WORKTREE_BASE"
  git worktree add "$WORKTREE_DIR" -b "$BRANCH_NAME" origin/dev

  # Plan-Docs ins Worktree kopieren: docs/plans/ ist per .git/info/exclude lokal
  # ausgeschlossen, der Agent muss sie lesen, committet werden sie nicht.
  mkdir -p "$WORKTREE_DIR/docs/plans"
  cp -R "$REPO_ROOT/docs/plans/"* "$WORKTREE_DIR/docs/plans/" 2>/dev/null || true

  cd "$WORKTREE_DIR"

  # Dependencies & Initial-Build für Go-Embed bereitstellen
  bun install --cwd frontend --frozen-lockfile >> "$LOG_FILE" 2>&1
  bun run --cwd frontend build >> "$LOG_FILE" 2>&1

  PROMPT="Task-ID: $TARGET_ID
Task-Titel: $TASK_TITLE
PR_BODY_FILE: $PR_BODY_FILE
QUESTION_OUT: $QUESTION_OUT

$(cat "$REPO_ROOT/prompts/runner.md")"

  # Claude im Worktree starten (Timeout: 30 Min, Max 80 Turns, Mac wachhalten)
  caffeinate -i perl -e 'alarm shift; exec @ARGV' 1800 \
    claude -p "$PROMPT" \
    --append-system-prompt "$(cat "$REPO_ROOT/AGENTS.md")" \
    --max-turns 80 \
    --permission-mode acceptEdits \
    --allowedTools "Read,Edit,Write,Bash(go test:*),Bash(go build:*),Bash(bun run:*),Bash(task test),Bash(git diff:*),Bash(git status)" \
    >> "$LOG_FILE" 2>&1 || true

  # FALL A: Der Agent hat eine Rückfrage gestellt
  if [ -s "$QUESTION_OUT" ]; then
    echo "Task #$TARGET_ID hat eine Rückfrage erzeugt -> BLOCKED."
    cd "$REPO_ROOT"
    waypoint task block "$TARGET_ID"
    {
      echo "## ❓ Frage zu Task #$TARGET_ID: $TASK_TITLE ($(date "+%Y-%m-%d %H:%M"))"
      cat "$QUESTION_OUT"
      echo ""
      echo "---"
      echo ""
    } >> "$QUESTIONS_FILE"
    continue
  fi

  # Schutzschild: Verbotene Dateien vor Commit zurücksetzen
  rm -rf frontend/dist
  git checkout -- .waypoint.json go.mod go.sum frontend/package.json frontend/bun.lock 2>/dev/null || true

  if [ -z "$(git status --porcelain)" ]; then
    cd "$REPO_ROOT"
    waypoint task block "$TARGET_ID"
    {
      echo "## ⚠️ Abbruch bei Task #$TARGET_ID: $TASK_TITLE ($(date "+%Y-%m-%d %H:%M"))"
      echo "Der Agent hat keine Dateien geändert. Log: $LOG_FILE"
      echo ""
      echo "---"
      echo ""
    } >> "$QUESTIONS_FILE"
    continue
  fi

  # Unabhängiges Host-Gate (Frontend-Build für Embed + task test + go test -race)
  bun run --cwd frontend build >> "$LOG_FILE" 2>&1 || true
  if ! task test >> "$LOG_FILE" 2>&1 || ! go test -race ./... >> "$LOG_FILE" 2>&1 || [ ! -s "$PR_BODY_FILE" ]; then
    echo "Task #$TARGET_ID ist am Host-Gate gescheitert -> BLOCKED."
    cd "$REPO_ROOT"
    waypoint task block "$TARGET_ID"
    {
      echo "## ⚠️ Test-Gate fehlgeschlagen bei Task #$TARGET_ID: $TASK_TITLE ($(date "+%Y-%m-%d %H:%M"))"
      echo "Log-Datei: \`$LOG_FILE\` — letzte 20 Zeilen:"
      echo '```text'
      tail -n 20 "$LOG_FILE"
      echo '```'
      echo ""
      echo "---"
      echo ""
    } >> "$QUESTIONS_FILE"
    continue
  fi

  # Build-Artefakte vor dem Commit wieder entfernen
  rm -rf frontend/dist
  git checkout -- frontend/dist 2>/dev/null || true

  # Größen-Gate prüfen (Max 450 Zeilen, inkl. neuer Dateien)
  git add -A
  CHANGED_LINES=$(git diff --cached --numstat | awk '{sum += $1 + $2} END {print sum+0}')
  if [ "$CHANGED_LINES" -gt 450 ]; then
    cd "$REPO_ROOT"
    waypoint task block "$TARGET_ID"
    {
      echo "## ⚠️ Task #$TARGET_ID zu groß ($CHANGED_LINES Zeilen > 450): $TASK_TITLE"
      echo "Bitte den Task kleiner schneiden."
      echo ""
      echo "---"
      echo ""
    } >> "$QUESTIONS_FILE"
    continue
  fi

  # FALL B: Alles grün -> Commit, Push & PR
  CLEAN_TITLE=$(echo "$TASK_TITLE" | sed -E 's/^\[[^]]+\] *//')
  git commit -m "feat: $CLEAN_TITLE [task $TARGET_ID]" -m "AI-Assisted: Claude Code"
  git push -u origin "$BRANCH_NAME"

  # Label 'ai-generated' anlegen falls es noch nicht existiert
  gh label create "ai-generated" --color "0E8A16" --description "Autonomous agent PR" 2>/dev/null || true

  gh pr create \
    --base dev \
    --head "$BRANCH_NAME" \
    --label "ai-generated" \
    --title "feat: $CLEAN_TITLE [#$TARGET_ID]" \
    --body-file "$PR_BODY_FILE"

  cd "$REPO_ROOT"
  git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
  TASKS_DONE=$((TASKS_DONE + 1))
  echo "---> Task #$TARGET_ID erfolgreich als PR eingereicht ($CHANGED_LINES Zeilen)."

  # Dynamische Bremse: War der Task mittelgroß (> 200 Zeilen), heute keinen zweiten mehr starten
  if [ "$CHANGED_LINES" -gt 200 ]; then
    echo "Task #$TARGET_ID hatte $CHANGED_LINES Zeilen (> 200). Belasse es für heute bei 1 PR."
    break
  fi
done
