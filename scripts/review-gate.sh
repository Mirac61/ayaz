#!/usr/bin/env bash
# Review helpers for unattended agent runs in scripts/agent-night.sh.
#
# Sourced by agent-night.sh and by scripts/review-gate-test.sh. Only the report
# of the host-invoked reviewer may be passed to the gate: the implementer's own
# review report, $REVIEW_OUT, is no proof, because the implementer can write it.

# review_gate_passes <reviewer-exit-status> <report-file>
# Passes only when the reviewer exited cleanly and its first verdict is PASS.
review_gate_passes() {
  local exit_code="$1"
  local report="$2"

  [ "$exit_code" -eq 0 ] || return 1
  [ -s "$report" ] || return 1
  [ "$(grep -m1 '^VERDICT:' "$report")" = "VERDICT: PASS" ]
}

# collect_review_input <out-file> <description>
# Writes what the reviewer gets: the description, tracked changes against HEAD
# (staged and unstaged) and the patches of untracked files. The reviewer
# definition is excluded; it is restored from the repository copy before the
# commit, so it never lands in the diff under review.
collect_review_input() {
  local out="$1"
  local description="$2"

  {
    echo "$description"
    echo "Everything you need is below; report in the format from your instructions."
    echo
    echo '```diff'
    git diff HEAD -- . ':(exclude).claude/agents/reviewer.md'
    git ls-files --others --exclude-standard -- . ':(exclude).claude/agents/reviewer.md' \
      | while IFS= read -r f; do
          git diff --no-index /dev/null "$f" || true
        done
    echo '```'
  } > "$out"
}

# run_host_review <input-file> <report-file>
# Runs the read-only reviewer on its own and returns its exit status. The report
# file must be fresh; callers create it with mktemp.
run_host_review() {
  local input="$1"
  local report="$2"

  caffeinate -i perl -e 'alarm shift; exec @ARGV' 900 \
    claude -p \
    --agent reviewer \
    --allowedTools "Read,Grep,Glob" \
    --max-turns 30 \
    < "$input" > "$report" 2>&1
}

# Auto-merge is only for small, low-risk changes. Every changed file must be in
# AUTOMERGE_PATHS and none in AUTOMERGE_NEVER. Agent rules (scripts, prompts,
# .claude, AGENTS.md, CI) are never merged by the agent: it could relax its own
# gate. UI (.tsx, .css, ui/, shell/, editor/ …) needs a human click test.
AUTOMERGE_MAX_LINES=100
AUTOMERGE_PATHS='^(docs/.*|README\.md|internal/.*\.go|frontend/src/(core|lang)/.*\.ts)$'
AUTOMERGE_NEVER='^internal/(workspace|fsserve)/'

# automerge_allowed <changed-lines> <report-file>  (changed paths on stdin)
# Passes when the change is small, every path is allowed and the reviewer's
# first RISK line is LOW.
automerge_allowed() {
  local lines="$1" report="$2" f any=0
  [ "$lines" -le "$AUTOMERGE_MAX_LINES" ] || return 1
  [ "$(grep -m1 '^RISK:' "$report")" = "RISK: LOW" ] || return 1
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    any=1
    [[ "$f" =~ $AUTOMERGE_PATHS ]] || return 1
    [[ "$f" =~ $AUTOMERGE_NEVER ]] && return 1
  done
  [ "$any" = 1 ]
}

# plan_allows_automerge <repo-root> <task-title>
# Fails when the task's section in its plan doc says "Auto-Merge: nein".
# Title format: "[docs/plans/<plan>.md] <short title>", section "## Task: <short title>".
plan_allows_automerge() {
  local root="$1" title="$2" plan short
  plan=$(sed -nE 's/^\[([^]]+)\].*/\1/p' <<< "$title")
  [ -n "$plan" ] && [ -f "$root/$plan" ] || return 0
  short=$(sed -E 's/^\[[^]]+\] *//' <<< "$title")
  ! awk -v h="## Task: $short" '$0 == h { on = 1; next } /^## / { on = 0 } on' "$root/$plan" \
    | grep -qiE 'auto-?merge:? *\**:? *nein'
}

# PR body rules from prompts/runner.md: only the four template headings, at most
# PR_BODY_MAX_LINES non-blank lines and PR_BODY_MAX_WORDS words besides them;
# the word cap stops a few lines from turning into paragraphs. Prompts alone drift.
PR_BODY_MAX_LINES=12
PR_BODY_MAX_WORDS=150
PR_BODY_HEADINGS='^### (Was wurde geändert\?|Getestet|Manual Check \(für das Review am Morgen\)|Hinweise)$'

# pr_body_problem <file>
# Prints what breaks the rules, one sentence per problem; prints nothing when the body is fine.
pr_body_problem() {
  local f="$1" lines words bad
  if [ ! -s "$f" ]; then
    echo "Der PR-Body ist leer."
    return
  fi
  grep -qxF '### Was wurde geändert?' "$f" || echo "Der Abschnitt „### Was wurde geändert?“ fehlt."
  bad=$(grep -E '^#{1,6} ' "$f" | grep -Ev "$PR_BODY_HEADINGS" | paste -sd ';' -)
  [ -z "$bad" ] || echo "Nicht erlaubte Überschriften: $bad."
  lines=$(grep -Ev '^#{1,6} ' "$f" | grep -c '[^[:space:]]')
  [ "$lines" -le "$PR_BODY_MAX_LINES" ] || echo "$lines Zeilen Text, erlaubt sind $PR_BODY_MAX_LINES."
  words=$(grep -Ev '^#{1,6} ' "$f" | wc -w | tr -d ' ')
  [ "$words" -le "$PR_BODY_MAX_WORDS" ] || echo "$words Wörter, erlaubt sind $PR_BODY_MAX_WORDS."
}

# review_summary <report-file>
# The part of a host report worth a PR comment: verdict, risk and the non-empty
# finding sections. CHECKED and NOT CHECKED stay in the log; the PR body's
# Manual Check already says what a human has to try.
review_summary() {
  awk '
    /^(CHECKED|NOT CHECKED)$/ { exit }
    /^(BLOCKER|SHOULD-FIX|DECISION|NIT)$/ { head = $0; next }
    NF == 0 { next }
    { if (head != "") { print ""; print "**" head "**"; head = "" } print }
  ' "$1"
}

# worktree_tree
# Tree id of the working tree including untracked files, without touching the
# real index, so a later reset_protected still restores from HEAD.
worktree_tree() {
  local idx
  idx=$(mktemp "${TMPDIR:-/tmp}/ayaz-index.XXXXXX")
  cp "$(git rev-parse --git-path index)" "$idx"
  GIT_INDEX_FILE="$idx" git add -A
  GIT_INDEX_FILE="$idx" git write-tree
  rm -f "$idx"
}

# pr_change_section  (PR body on stdin)
# The bullets under "### Was wurde geändert?", for the squash commit: what
# changed is worth keeping in history, tests, manual checks and trailers are not.
pr_change_section() {
  awk '
    /^#{1,6} / { on = ($0 == "### Was wurde geändert?"); next }
    /^(🤖|> )/ { next }
    on && NF { print }
  '
}
