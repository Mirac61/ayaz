#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK_DIR="/tmp/ayaz-agent.lock"
WORKTREE_BASE="$REPO_ROOT/../ayaz-agent-worktrees"
QUESTIONS_FILE="$REPO_ROOT/QUESTIONS.md"
MAX_TASKS_PER_NIGHT="${1:-4}"
TASKS_DONE=0
OPENED_PRS=""
TOOLS="Read,Edit,Write,Grep,Glob,WebFetch,WebSearch,Agent,Bash(go test:*),Bash(go build:*),Bash(bun run:*),Bash(task test),Bash(git diff:*),Bash(git status:*)"

# Reviewer-Definition auf den Repo-Stand bringen. Der Umsetzer darf sie nicht
# verändern; deshalb wird sie auch direkt vor dem Host-Review nochmal erneuert.
sync_reviewer_agent() {
  if ! cmp -s "$REPO_ROOT/.claude/agents/reviewer.md" .claude/agents/reviewer.md 2>/dev/null; then
    mkdir -p .claude/agents
    cp "$REPO_ROOT/.claude/agents/reviewer.md" .claude/agents/reviewer.md
    REVIEW_AGENT_COPIED=1
  fi
}

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
fi

for TARGET_ID in $TODO_IDS; do
  if [ "$TASKS_DONE" -ge "$MAX_TASKS_PER_NIGHT" ]; then
    echo "Tageslimit ($MAX_TASKS_PER_NIGHT Tasks) erreicht. Stoppe für heute."
    break
  fi

  # Status can change after the snapshot above; skip tasks that are no longer TODO.
  TASK_JSON=$(waypoint -p --json | jq -c ".tasks[] | select(.id==\"$TARGET_ID\" and .status==\"TODO\")")
  if [ -z "$TASK_JSON" ]; then
    echo "Task #$TARGET_ID ist nicht mehr TODO, überspringe."
    continue
  fi
  TASK_TITLE=$(echo "$TASK_JSON" | jq -r '.title')
  echo "---> Starte Task #$TARGET_ID: $TASK_TITLE"

  # Task lokal im Haupt-Repo als IN_PROGRESS markieren
  waypoint task start "$TARGET_ID"

  WORKTREE_DIR="$WORKTREE_BASE/task-$TARGET_ID"
  BRANCH_NAME="feat/task-$TARGET_ID"
  PR_BODY_FILE="/tmp/ayaz-pr-$TARGET_ID.md"
  QUESTION_OUT="/tmp/ayaz-question-$TARGET_ID.md"
  REVIEW_OUT="/tmp/ayaz-review-$TARGET_ID.md"
  REVIEW_INPUT="/tmp/ayaz-diff-$TARGET_ID.md"
  LOG_FILE="/tmp/ayaz-run-$TARGET_ID.log"

  rm -f "$PR_BODY_FILE" "$QUESTION_OUT" "$REVIEW_OUT" "$REVIEW_INPUT" "$LOG_FILE"
  git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
  git branch -D "$BRANCH_NAME" 2>/dev/null || true

  # Stacking: hat ein früherer Task aus demselben Plan einen offenen PR, baut dieser darauf auf.
  BASE_BRANCH=dev
  PLAN=$(echo "$TASK_TITLE" | sed -nE 's/^\[([^]]+)\].*/\1/p')
  if [ -n "$PLAN" ]; then
    for P in $(waypoint -p --json | jq -r --arg p "[$PLAN]" --argjson id "$TARGET_ID" \
        '[.tasks[] | select((.title | startswith($p)) and (.id | tonumber) < $id)] | sort_by(.id | tonumber) | reverse | .[].id'); do
      P_STATE=$(gh pr view "feat/task-$P" --json state --jq .state 2>/dev/null || true)
      [ "$P_STATE" = "OPEN" ] && BASE_BRANCH="feat/task-$P"
      [ -n "$P_STATE" ] && break # jüngster Vorgänger mit PR entscheidet; gemergt heißt: dev
    done
  fi
  git fetch origin "$BASE_BRANCH"
  echo "Basis: $BASE_BRANCH"

  mkdir -p "$WORKTREE_BASE"
  git worktree add "$WORKTREE_DIR" -b "$BRANCH_NAME" "origin/$BASE_BRANCH"

  # Plan-Docs ins Worktree kopieren: docs/plans/ ist per .git/info/exclude lokal
  # ausgeschlossen, der Agent muss sie lesen, committet werden sie nicht.
  mkdir -p "$WORKTREE_DIR/docs/plans"
  cp -R "$REPO_ROOT/docs/plans/"* "$WORKTREE_DIR/docs/plans/" 2>/dev/null || true

  cd "$WORKTREE_DIR"

  # Reviewer-Definition bereitstellen: der Umsetzer reviewt damit selbst, der
  # Host nutzt dieselbe Fassung. Vor dem Commit wird sie zurückgesetzt.
  REVIEW_AGENT_COPIED=0
  sync_reviewer_agent

  # Dependencies & Initial-Build für Go-Embed bereitstellen
  bun install --cwd frontend --frozen-lockfile >> "$LOG_FILE" 2>&1
  bun run --cwd frontend build >> "$LOG_FILE" 2>&1

  PROMPT="Task-ID: $TARGET_ID
Task-Titel: $TASK_TITLE
BASIS: $BASE_BRANCH
PR_BODY_FILE: $PR_BODY_FILE
QUESTION_OUT: $QUESTION_OUT
REVIEW_OUT: $REVIEW_OUT

$(cat "$REPO_ROOT/prompts/runner.md")"

  # Claude im Worktree starten (Timeout: 30 Min, Max 100 Turns, Mac wachhalten).
  # Coding auf Sonnet; das Review läuft im reviewer-Subagenten auf fable.
  caffeinate -i perl -e 'alarm shift; exec @ARGV' 1800 \
    claude -p "$PROMPT" \
    --model sonnet \
    --append-system-prompt "$(cat "$REPO_ROOT/AGENTS.md")" \
    --max-turns 100 \
    --permission-mode acceptEdits \
    --allowedTools "$TOOLS" \
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

  # Review-Gate: Der Host startet den Reviewer selbst auf dem finalen Diff.
  # Der Bericht des Umsetzers ($REVIEW_OUT) ist kein Nachweis — er könnte ihn
  # selbst geschrieben haben. Deshalb erst jetzt eine frische Datei mit
  # zufälligem Namen anlegen, die Definition erneuern, mit `>` schreiben und
  # den Exit-Status prüfen; `>>` auf einen erratbaren Pfad wäre fälschbar.
  sync_reviewer_agent
  HOST_REVIEW_OUT=$(mktemp "${TMPDIR:-/tmp}/ayaz-review-host.XXXXXX")
  {
    echo "Review the change in this repository (working tree, task: $TASK_TITLE, base: $BASE_BRANCH)."
    echo "Everything you need is below; report in the format from your instructions."
    echo
    echo '```diff'
    git diff HEAD -- . ':(exclude).claude/agents/reviewer.md'
    git ls-files --others --exclude-standard -- . ':(exclude).claude/agents/reviewer.md' \
      | while IFS= read -r f; do
          git diff --no-index /dev/null "$f" || true
        done
    echo '```'
  } > "$REVIEW_INPUT"

  REVIEW_EXIT=0
  caffeinate -i perl -e 'alarm shift; exec @ARGV' 900 \
    claude -p \
    --agent reviewer \
    --allowedTools "Read,Grep,Glob" \
    --max-turns 30 \
    < "$REVIEW_INPUT" > "$HOST_REVIEW_OUT" 2>&1 || REVIEW_EXIT=$?

  if [ "$REVIEW_EXIT" -ne 0 ] || ! grep -q '^VERDICT: PASS' "$HOST_REVIEW_OUT"; then
    echo "Task #$TARGET_ID ohne Reviewer-PASS -> BLOCKED."
    cd "$REPO_ROOT"
    waypoint task block "$TARGET_ID"
    {
      echo "## 🔎 Review nicht bestanden bei Task #$TARGET_ID: $TASK_TITLE ($(date "+%Y-%m-%d %H:%M"))"
      echo "Reviewer-Exit-Status: $REVIEW_EXIT"
      echo ""
      if [ -s "$HOST_REVIEW_OUT" ]; then
        cat "$HOST_REVIEW_OUT"
      else
        echo "Der Host-Reviewer hat keinen Bericht erzeugt. Log: \`$LOG_FILE\`"
      fi
      if [ -s "$REVIEW_OUT" ]; then
        echo ""
        echo "Bericht des Umsetzers (nicht das Gate): \`$REVIEW_OUT\`"
      fi
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

  # Für den Lauf ersetzte Reviewer-Definition zurücksetzen, damit sie nicht im Task-PR landet.
  if [ "${REVIEW_AGENT_COPIED:-0}" = 1 ]; then
    git checkout -- .claude/agents/reviewer.md 2>/dev/null || rm -f .claude/agents/reviewer.md
  fi

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
  git commit -m "feat: $CLEAN_TITLE [task $TARGET_ID]" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
  git push -u origin "$BRANCH_NAME"

  [ "$BASE_BRANCH" != dev ] && printf '\n> Gestapelt auf `%s`. `scripts/agent-merge.sh` zieht diesen PR nach dem Merge des Vorgängers auf `dev` um.\n' "$BASE_BRANCH" >> "$PR_BODY_FILE"
  PR_URL=$(gh pr create \
    --base "$BASE_BRANCH" \
    --head "$BRANCH_NAME" \
    --title "feat: $CLEAN_TITLE [#$TARGET_ID]" \
    --body-file "$PR_BODY_FILE")
  echo "$PR_URL"
  OPENED_PRS="$OPENED_PRS ${PR_URL##*/}"
  # Default-Branch ist main: CodeRabbit überspringt PRs gegen dev und gestapelte PRs, also immer manuell anstoßen.
  gh pr comment "${PR_URL##*/}" --body "@coderabbitai review" >/dev/null || true

  cd "$REPO_ROOT"
  git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
  TASKS_DONE=$((TASKS_DONE + 1))
  echo "---> Task #$TARGET_ID erfolgreich als PR eingereicht ($CHANGED_LINES Zeilen)."
done

# CodeRabbit-Durchlauf: Hinweise auf offenen Agent-PRs einmal selbst abarbeiten (Label cr-checked).
# CodeRabbit braucht ~25 Min. Auf die PRs von heute Nacht höchstens 45 Min warten, ältere ohne Review kommen nächste Nacht dran.
cr_reviewed() { gh api "repos/{owner}/{repo}/pulls/$1/reviews" --jq '[.[] | select(.user.login == "coderabbitai[bot]")] | length' 2>/dev/null || echo 0; }

for _ in $(seq 15); do
  [ -z "$OPENED_PRS" ] && break
  WAITING=0
  for B in $OPENED_PRS; do [ "$(cr_reviewed "$B")" -gt 0 ] || WAITING=1; done
  [ "$WAITING" -eq 0 ] && break
  echo "Warte auf CodeRabbit ..."
  sleep 180
done

gh label create cr-checked --color ededed --description "Agent hat CodeRabbit-Hinweise bearbeitet" >/dev/null 2>&1 || true
for ROW in $(gh pr list --state open --json number,headRefName,labels \
    --jq '.[] | select((.headRefName | startswith("feat/task-")) and ([.labels[].name] | index("cr-checked") | not)) | "\(.number):\(.headRefName)"'); do
  NR="${ROW%%:*}"; BR="${ROW#*:}"
  [ "$(cr_reviewed "$NR")" -gt 0 ] || continue
  COMMENTS=$(gh api "repos/{owner}/{repo}/pulls/$NR/comments" \
    --jq '.[] | select(.user.login == "coderabbitai[bot]") | "### \(.path):\(.line // .original_line)\n\(.body)\n"')
  REVIEWS=$(gh api "repos/{owner}/{repo}/pulls/$NR/reviews" --jq '.[] | select(.user.login == "coderabbitai[bot]") | .body')
  echo "---> CodeRabbit-Durchlauf für PR #$NR ($BR)"

  CR_DIR="$WORKTREE_BASE/cr-$NR"
  CR_LOG="/tmp/ayaz-cr-$NR.log"
  CR_OUT="/tmp/ayaz-cr-$NR.md"
  rm -f "$CR_OUT" "$CR_LOG"
  git fetch origin "$BR"
  git worktree remove --force "$CR_DIR" 2>/dev/null || true
  git worktree add -f -B "$BR" "$CR_DIR" "origin/$BR"
  cd "$CR_DIR"
  bun install --cwd frontend --frozen-lockfile >> "$CR_LOG" 2>&1
  bun run --cwd frontend build >> "$CR_LOG" 2>&1
  caffeinate -i perl -e 'alarm shift; exec @ARGV' 1200 \
    claude -p "CR_OUT: $CR_OUT

$(cat "$REPO_ROOT/prompts/coderabbit.md")

## Review-Zusammenfassung
$REVIEWS

## Kommentare
$COMMENTS" \
    --model sonnet \
    --append-system-prompt "$(cat "$REPO_ROOT/AGENTS.md")" \
    --max-turns 60 \
    --permission-mode acceptEdits \
    --allowedTools "$TOOLS" \
    >> "$CR_LOG" 2>&1 || true

  rm -rf frontend/dist
  git checkout -- .waypoint.json go.mod go.sum frontend/package.json frontend/bun.lock 2>/dev/null || true
  if [ -n "$(git status --porcelain)" ]; then
    bun run --cwd frontend build >> "$CR_LOG" 2>&1 || true
    if task test >> "$CR_LOG" 2>&1 && go test -race ./... >> "$CR_LOG" 2>&1; then
      rm -rf frontend/dist
      git add -A
      git commit -m "fix: CodeRabbit-Hinweise umgesetzt" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
      git push origin "$BR"
    else
      echo "Nach den CodeRabbit-Fixes ist das Test-Gate rot, nichts gepusht. Log: \`$CR_LOG\`" >> "$CR_OUT"
    fi
  fi
  [ -s "$CR_OUT" ] && gh pr comment "$NR" --body-file "$CR_OUT"
  gh pr edit "$NR" --add-label cr-checked >/dev/null

  # Reine Docs-PRs direkt auf dev mergen, sobald die CI grün ist.
  BASE=$(gh pr view "$NR" --json baseRefName --jq .baseRefName)
  NON_DOCS=$(gh pr diff "$NR" --name-only | grep -vE '^docs/|\.md$' || true)
  if [ "$BASE" = dev ] && [ -z "$NON_DOCS" ] && gh pr checks "$NR" --watch >/dev/null 2>&1; then
    "$REPO_ROOT/scripts/agent-merge.sh" "${BR#feat/task-}" || true
  fi

  cd "$REPO_ROOT"
  git worktree remove --force "$CR_DIR" 2>/dev/null || true
done
