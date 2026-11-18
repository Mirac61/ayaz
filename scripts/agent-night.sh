#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/review-gate.sh
. "$REPO_ROOT/scripts/review-gate.sh"
LOCK_DIR="/tmp/ayaz-agent.lock"
WORKTREE_BASE="$REPO_ROOT/../ayaz-agent-worktrees"
QUESTIONS_FILE="$REPO_ROOT/QUESTIONS.md"
MAX_TASKS_PER_NIGHT="${1:-4}"
TASKS_DONE=0
OPENED_PRS=""
TOOLS="Read,Edit,Write,Grep,Glob,WebFetch,WebSearch,Agent,Bash(go test:*),Bash(go build:*),Bash(bun run:*),Bash(task test),Bash(git diff:*),Bash(git status:*)"
# Unsichtbare Marke in jedem Kommentar des Agents: alles davor gilt als erledigt.
AGENT_MARK="<!-- agent -->"
ME=$(gh api user --jq .login)

# Reviewer-Definition auf den Repo-Stand bringen. Der Umsetzer darf sie nicht
# verändern; deshalb wird sie direkt vor jedem Host-Review erneuert.
sync_reviewer_agent() {
  if ! cmp -s "$REPO_ROOT/.claude/agents/reviewer.md" .claude/agents/reviewer.md 2>/dev/null; then
    mkdir -p .claude/agents
    cp "$REPO_ROOT/.claude/agents/reviewer.md" .claude/agents/reviewer.md
    REVIEW_AGENT_COPIED=1
  fi
}

# Schutzschild: verbotene Dateien zurücksetzen. Der Host-Reviewer läuft im
# Worktree und lädt dessen CLAUDE.md und .claude/: Was der Umsetzer dort anlegt,
# darf ihm keine Anweisungen geben.
reset_protected() {
  rm -rf frontend/dist
  git checkout -- .waypoint.json go.mod go.sum frontend/package.json frontend/bun.lock 2>/dev/null || true
  git checkout -- .claude 2>/dev/null || true
  git clean -fdqx -- .claude CLAUDE.md
}

# Task blockieren und den Grund für den Morgen in QUESTIONS.md schreiben.
# block_task <id> <titel> <überschrift> <text>
block_task() {
  cd "$REPO_ROOT"
  waypoint task block "$1"
  {
    echo "## $3 bei Task #$1: $2 ($(date "+%Y-%m-%d %H:%M"))"
    echo "$4"
    echo ""
    echo "---"
    echo ""
  } >> "$QUESTIONS_FILE"
}

# Umsetzer-Session fortsetzen (sie kennt ihren eigenen Verlauf).
# resume_agent <session-id> <prompt> <log>
resume_agent() {
  caffeinate -i perl -e 'alarm shift; exec @ARGV' 1200 \
    claude -p "$2" \
    --resume "$1" \
    --model sonnet \
    --append-system-prompt "$(cat "$REPO_ROOT/AGENTS.md")" \
    --max-turns 60 \
    --permission-mode acceptEdits \
    --allowedTools "$TOOLS" \
    >> "$3" 2>&1 || true
}

# Test-Gate, Host-Review und bis zu drei Review-Runden im aktuellen Worktree.
# Bei FAIL bekommt die Umsetzer-Session den Bericht und fixt; danach alles neu.
# review_loop <log> <session-id> <rückfrage-datei> <beschreibung>
# 0 = PASS (Bericht in $HOST_REVIEW_OUT), 1 = Tests rot, 2 = kein PASS nach 3 Runden, 3 = Rückfrage.
review_loop() {
  local log="$1" session="$2" question="$3" desc="$4" round input
  for round in 1 2 3; do
    reset_protected
    bun run --cwd frontend build >> "$log" 2>&1 || true
    if ! task test >> "$log" 2>&1 || ! go test -race ./... >> "$log" 2>&1; then
      return 1
    fi
    rm -rf frontend/dist
    git checkout -- frontend/dist 2>/dev/null || true

    # Frische Dateien mit zufälligem Namen, mit `>` geschrieben: der Umsetzer
    # kann kein Urteil vorab hinlegen.
    sync_reviewer_agent
    HOST_REVIEW_OUT=$(mktemp "${TMPDIR:-/tmp}/ayaz-review-host.XXXXXX")
    input=$(mktemp "${TMPDIR:-/tmp}/ayaz-review-input.XXXXXX")
    collect_review_input "$input" "$desc"
    REVIEW_EXIT=0
    run_host_review "$input" "$HOST_REVIEW_OUT" || REVIEW_EXIT=$?
    if review_gate_passes "$REVIEW_EXIT" "$HOST_REVIEW_OUT"; then
      return 0
    fi
    [ "$round" -lt 3 ] || return 2

    echo "Host-Review Runde $round ohne PASS (Exit $REVIEW_EXIT), Fix-Runde." | tee -a "$log"
    resume_agent "$session" "Der unabhängige Reviewer hat deine Änderung abgelehnt (Runde $round von 3). Sein Bericht:

$(cat "$HOST_REVIEW_OUT")

Behebe jeden BLOCKER und SHOULD-FIX an der Ursache, NITs nur wenn trivial. Bei einem DECISION schreibst du die Frage nach $question und änderst nichts. Danach \`task test\`. Starte keinen eigenen Reviewer, der Host prüft erneut." "$log"
    [ -s "$question" ] && return 3
  done
}

# 1. Atomares Lock (verhindert doppelte Ausführung)
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Ein anderer Agent-Lauf ist noch aktiv ($LOCK_DIR). Breche ab."
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT INT TERM

cd "$REPO_ROOT"
git fetch origin dev
gh label create automerge --color 0e8a16 --description "Agent darf nach grüner CI selbst mergen" >/dev/null 2>&1 || true

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
  LOG_FILE="/tmp/ayaz-run-$TARGET_ID.log"
  SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

  rm -f "$PR_BODY_FILE" "$QUESTION_OUT" "$LOG_FILE"
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
  REVIEW_AGENT_COPIED=0

  # Dependencies & Initial-Build für Go-Embed bereitstellen
  bun install --cwd frontend --frozen-lockfile >> "$LOG_FILE" 2>&1
  bun run --cwd frontend build >> "$LOG_FILE" 2>&1

  PROMPT="Task-ID: $TARGET_ID
Task-Titel: $TASK_TITLE
BASIS: $BASE_BRANCH
PR_BODY_FILE: $PR_BODY_FILE
QUESTION_OUT: $QUESTION_OUT

$(cat "$REPO_ROOT/prompts/runner.md")"

  # Claude im Worktree starten (Timeout: 30 Min, Max 100 Turns, Mac wachhalten).
  # Coding auf Sonnet; das Review macht danach der Host auf Opus.
  caffeinate -i perl -e 'alarm shift; exec @ARGV' 1800 \
    claude -p "$PROMPT" \
    --session-id "$SESSION_ID" \
    --model sonnet \
    --append-system-prompt "$(cat "$REPO_ROOT/AGENTS.md")" \
    --max-turns 100 \
    --permission-mode acceptEdits \
    --allowedTools "$TOOLS" \
    >> "$LOG_FILE" 2>&1 || true

  # FALL A: Der Agent hat eine Rückfrage gestellt
  if [ -s "$QUESTION_OUT" ]; then
    echo "Task #$TARGET_ID hat eine Rückfrage erzeugt -> BLOCKED."
    block_task "$TARGET_ID" "$TASK_TITLE" "❓ Frage" "$(cat "$QUESTION_OUT")"
    continue
  fi

  reset_protected
  if [ -z "$(git status --porcelain)" ]; then
    block_task "$TARGET_ID" "$TASK_TITLE" "⚠️ Abbruch" "Der Agent hat keine Dateien geändert. Log: $LOG_FILE"
    continue
  fi

  # Test-Gate und Host-Review mit bis zu drei Runden. Den Bericht des Umsetzers
  # gibt es nicht mehr als Nachweis: nur das Urteil des Host-Reviewers zählt.
  RC=0
  review_loop "$LOG_FILE" "$SESSION_ID" "$QUESTION_OUT" \
    "Review the change in this repository (working tree, task: $TASK_TITLE, base: $BASE_BRANCH)." || RC=$?
  case "$RC" in
    1)
      echo "Task #$TARGET_ID ist am Test-Gate gescheitert -> BLOCKED."
      block_task "$TARGET_ID" "$TASK_TITLE" "⚠️ Test-Gate fehlgeschlagen" \
        "$(echo "Log-Datei: \`$LOG_FILE\` — letzte 20 Zeilen:"; echo '```text'; tail -n 20 "$LOG_FILE"; echo '```')"
      continue ;;
    2)
      echo "Task #$TARGET_ID ohne Reviewer-PASS nach 3 Runden -> BLOCKED."
      block_task "$TARGET_ID" "$TASK_TITLE" "🔎 Review nach 3 Runden nicht bestanden" \
        "$(echo "Reviewer-Exit-Status: $REVIEW_EXIT"; echo ""; cat "$HOST_REVIEW_OUT")"
      continue ;;
    3)
      echo "Task #$TARGET_ID hat in einer Fix-Runde eine Rückfrage erzeugt -> BLOCKED."
      block_task "$TARGET_ID" "$TASK_TITLE" "❓ Frage aus dem Review" "$(cat "$QUESTION_OUT")"
      continue ;;
  esac
  if [ ! -s "$PR_BODY_FILE" ]; then
    block_task "$TARGET_ID" "$TASK_TITLE" "⚠️ Abbruch" "Der Agent hat keinen PR-Body geschrieben. Log: \`$LOG_FILE\`"
    continue
  fi

  # Für den Lauf ersetzte Reviewer-Definition zurücksetzen, damit sie nicht im Task-PR landet.
  if [ "${REVIEW_AGENT_COPIED:-0}" = 1 ]; then
    git checkout -- .claude/agents/reviewer.md 2>/dev/null || rm -f .claude/agents/reviewer.md
  fi

  # Größen-Gate prüfen (Max 450 Zeilen, inkl. neuer Dateien)
  git add -A
  CHANGED_LINES=$(git diff --cached --numstat | awk '{sum += $1 + $2} END {print sum+0}')
  if [ "$CHANGED_LINES" -gt 450 ]; then
    block_task "$TARGET_ID" "$TASK_TITLE" "⚠️ Zu groß" "Bitte den Task kleiner schneiden ($CHANGED_LINES Zeilen > 450)."
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
  PR_NR="${PR_URL##*/}"
  OPENED_PRS="$OPENED_PRS $PR_NR"
  { echo "$AGENT_MARK"; echo '### Host-Review'; echo; cat "$HOST_REVIEW_OUT"; } | gh pr comment "$PR_NR" --body-file - >/dev/null || true
  # Kleine, risikoarme PRs darf der Agent nach grüner CI selbst mergen (siehe review-gate.sh).
  if git diff --name-only HEAD~1 HEAD | automerge_allowed "$CHANGED_LINES" "$HOST_REVIEW_OUT" \
      && plan_allows_automerge "$REPO_ROOT" "$TASK_TITLE"; then
    gh pr edit "$PR_NR" --add-label automerge >/dev/null || true
  fi
  # Default-Branch ist main: CodeRabbit überspringt PRs gegen dev und gestapelte PRs, also immer manuell anstoßen.
  gh pr comment "$PR_NR" --body "@coderabbitai review" >/dev/null || true

  cd "$REPO_ROOT"
  git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
  TASKS_DONE=$((TASKS_DONE + 1))
  echo "---> Task #$TARGET_ID erfolgreich als PR eingereicht ($CHANGED_LINES Zeilen)."
done

# Folgedurchlauf auf offenen Agent-PRs: CodeRabbit-Hinweise (einmal, Label cr-checked)
# und meine Nachfragen (Kommentare, die mit @agent beginnen) abarbeiten.
# CodeRabbit braucht ~25 Min. Auf die PRs von heute Nacht höchstens 45 Min warten, ältere ohne Review kommen nächste Nacht dran.
cr_reviewed() { gh api "repos/{owner}/{repo}/pulls/$1/reviews" --jq '[.[] | select(.user.login == "coderabbitai[bot]")] | length' 2>/dev/null || echo 0; }

# Meine @agent-Kommentare am PR, die nach dem letzten Commit und der letzten
# Agent-Antwort kamen, also noch offen sind.
agent_requests() {
  local nr="$1" since
  since=$( {
    gh pr view "$nr" --json commits --jq '.commits[-1].committedDate'
    gh api --paginate "repos/{owner}/{repo}/issues/$nr/comments" \
      --jq '.[] | select(.body | contains("'"$AGENT_MARK"'")) | .created_at'
  } | sort | tail -n 1)
  {
    gh api --paginate "repos/{owner}/{repo}/issues/$nr/comments" \
      --jq '.[] | select(.user.login == "'"$ME"'" and (.body | startswith("@agent")) and .created_at > "'"$since"'") | "### PR\n\(.body)\n"'
    gh api --paginate "repos/{owner}/{repo}/pulls/$nr/comments" \
      --jq '.[] | select(.user.login == "'"$ME"'" and (.body | startswith("@agent")) and .created_at > "'"$since"'") | "### \(.path):\(.line // .original_line)\n\(.body)\n"'
  } 2>/dev/null || true
}

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
    --jq '.[] | select(.headRefName | startswith("feat/task-")) | "\(.number):\(.headRefName):\([.labels[].name] | index("cr-checked") != null)"'); do
  NR="${ROW%%:*}"; REST="${ROW#*:}"; BR="${REST%%:*}"; CHECKED="${REST##*:}"
  REQUESTS=$(agent_requests "$NR")
  CR_TODO=0
  [ "$CHECKED" = false ] && [ "$(cr_reviewed "$NR")" -gt 0 ] && CR_TODO=1
  FOLLOWUP_OK=1
  if [ "$CR_TODO" = 1 ] || [ -n "$REQUESTS" ]; then
    # Wer nachhakt, schaut sich den PR selbst an: dann kein Automerge mehr.
    [ -n "$REQUESTS" ] && { gh pr edit "$NR" --remove-label automerge >/dev/null 2>&1 || true; }
    COMMENTS=""; REVIEWS=""
    if [ "$CR_TODO" = 1 ]; then
      COMMENTS=$(gh api "repos/{owner}/{repo}/pulls/$NR/comments" \
        --jq '.[] | select(.user.login == "coderabbitai[bot]") | "### \(.path):\(.line // .original_line)\n\(.body)\n"')
      REVIEWS=$(gh api "repos/{owner}/{repo}/pulls/$NR/reviews" --jq '.[] | select(.user.login == "coderabbitai[bot]") | .body')
    fi
    echo "---> Folgedurchlauf für PR #$NR ($BR)"

    CR_DIR="$WORKTREE_BASE/cr-$NR"
    CR_LOG="/tmp/ayaz-cr-$NR.log"
    CR_OUT="/tmp/ayaz-cr-$NR.md"
    CR_QUESTION="/tmp/ayaz-cr-question-$NR.md"
    CR_SESSION=$(uuidgen | tr '[:upper:]' '[:lower:]')
    rm -f "$CR_OUT" "$CR_LOG" "$CR_QUESTION"
    git fetch origin "$BR"
    git worktree remove --force "$CR_DIR" 2>/dev/null || true
    git worktree add -f -B "$BR" "$CR_DIR" "origin/$BR"
    cd "$CR_DIR"
    REVIEW_AGENT_COPIED=0
    bun install --cwd frontend --frozen-lockfile >> "$CR_LOG" 2>&1
    bun run --cwd frontend build >> "$CR_LOG" 2>&1
    caffeinate -i perl -e 'alarm shift; exec @ARGV' 1200 \
      claude -p "CR_OUT: $CR_OUT
QUESTION_OUT: $CR_QUESTION

$(cat "$REPO_ROOT/prompts/coderabbit.md")

## Nachfragen von mir (@agent)
${REQUESTS:-(keine)}

## CodeRabbit-Zusammenfassung
${REVIEWS:-(keine)}

## CodeRabbit-Kommentare
${COMMENTS:-(keine)}" \
      --session-id "$CR_SESSION" \
      --model sonnet \
      --append-system-prompt "$(cat "$REPO_ROOT/AGENTS.md")" \
      --max-turns 60 \
      --permission-mode acceptEdits \
      --allowedTools "$TOOLS" \
      >> "$CR_LOG" 2>&1 || true

    reset_protected
    if [ -s "$CR_QUESTION" ]; then
      FOLLOWUP_OK=0
      cat "$CR_QUESTION" >> "$CR_OUT"
    elif [ -n "$(git status --porcelain)" ]; then
      # Auch Folge-Fixes gehen nur mit Test-Gate und unabhängigem Host-PASS raus.
      RC=0; FOLLOWUP_OK=0
      review_loop "$CR_LOG" "$CR_SESSION" "$CR_QUESTION" \
        "Review the change in this repository (follow-ups on PR #$NR, branch $BR)." || RC=$?
      case "$RC" in
        0)
          FOLLOWUP_OK=1
          if [ "${REVIEW_AGENT_COPIED:-0}" = 1 ]; then
            git checkout -- .claude/agents/reviewer.md 2>/dev/null || rm -f .claude/agents/reviewer.md
          fi
          git add -A
          git commit -m "fix: PR-Hinweise umgesetzt" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
          git push origin "$BR"
          { echo; echo '### Host-Review'; echo; cat "$HOST_REVIEW_OUT"; } >> "$CR_OUT"
          # Automerge bleibt nur, wenn auch die Folge-Änderung klein und risikoarm ist.
          PR_LINES=$(gh pr view "$NR" --json additions,deletions --jq '.additions + .deletions')
          if ! gh pr diff "$NR" --name-only | automerge_allowed "$PR_LINES" "$HOST_REVIEW_OUT"; then
            gh pr edit "$NR" --remove-label automerge >/dev/null 2>&1 || true
          fi ;;
        1) echo "Nach den Fixes ist das Test-Gate rot, nichts gepusht. Log: \`$CR_LOG\`" >> "$CR_OUT" ;;
        2) { echo "Kein Reviewer-PASS nach 3 Runden (Exit $REVIEW_EXIT), nichts committet oder gepusht."; echo; cat "$HOST_REVIEW_OUT"; } >> "$CR_OUT" ;;
        3) cat "$CR_QUESTION" >> "$CR_OUT" ;;
      esac
    fi
    # Immer antworten, auch ohne Änderung: die Marke schließt die Nachfragen ab.
    { echo "$AGENT_MARK"; cat "$CR_OUT" 2>/dev/null || echo "Nichts umzusetzen."; } | gh pr comment "$NR" --body-file - >/dev/null || true
    if [ "$CR_TODO" = 1 ]; then
      gh pr edit "$NR" --add-label cr-checked >/dev/null
      CHECKED=true
    fi
    cd "$REPO_ROOT"
    git worktree remove --force "$CR_DIR" 2>/dev/null || true
  fi

  # Mergen erst, wenn CodeRabbit abgearbeitet ist und kein Folgedurchlauf hängt:
  # reine Docs-PRs (ohne Agent-Regeln) und PRs mit Label automerge, sobald die CI grün ist.
  [ "$CHECKED" = true ] && [ "$FOLLOWUP_OK" = 1 ] || continue
  BASE=$(gh pr view "$NR" --json baseRefName --jq .baseRefName)
  AUTOMERGE=$(gh pr view "$NR" --json labels --jq '[.labels[].name] | index("automerge") != null')
  NON_DOCS=$(gh pr diff "$NR" --name-only | grep -vE '^docs/|^README\.md$' || true)
  if [ "$BASE" = dev ] && { [ -z "$NON_DOCS" ] || [ "$AUTOMERGE" = true ]; } && gh pr checks "$NR" --watch >/dev/null 2>&1; then
    "$REPO_ROOT/scripts/agent-merge.sh" "${BR#feat/task-}" || true
  fi
done
