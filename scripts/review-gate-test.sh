#!/usr/bin/env bash
# Tests for the host review gate (scripts/review-gate.sh).
# Run: bash scripts/review-gate-test.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/review-gate.sh
. "$REPO_ROOT/scripts/review-gate.sh"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ayaz-gate-test.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

CHECKS=0
FAILED=0

pass() {
  CHECKS=$((CHECKS + 1))
  echo "ok - $1"
}

fail() {
  CHECKS=$((CHECKS + 1))
  FAILED=$((FAILED + 1))
  echo "not ok - $1"
}

expect_block() {
  local name="$1" exit_code="$2" report="$3"
  if review_gate_passes "$exit_code" "$report"; then
    fail "$name"
  else
    pass "$name"
  fi
}

expect_allow() {
  local name="$1" exit_code="$2" report="$3"
  if review_gate_passes "$exit_code" "$report"; then
    pass "$name"
  else
    fail "$name"
  fi
}

# 1. Empty host report (the implementer's own PASS never reaches the gate).
: > "$TMP_DIR/host-review-fresh"
expect_block "empty host report blocks" 0 "$TMP_DIR/host-review-fresh"

# 2. The host reviewer failed, even though its report claims PASS.
printf 'VERDICT: PASS\n' > "$TMP_DIR/host-review-failed"
expect_block "PASS from a failed reviewer blocks" 1 "$TMP_DIR/host-review-failed"

# 3. The host reviewer passed.
printf 'VERDICT: PASS\n' > "$TMP_DIR/host-review-pass"
expect_allow "PASS from a clean reviewer passes" 0 "$TMP_DIR/host-review-pass"

# 4. The reviewer reported a problem.
printf 'VERDICT: FAIL\nBLOCKER: race in watcher\n' > "$TMP_DIR/host-review-verdict-fail"
expect_block "FAIL verdict blocks" 0 "$TMP_DIR/host-review-verdict-fail"

# 4b. Only the first verdict counts, a later PASS line does not.
printf 'VERDICT: FAIL\nCHECKED\nVERDICT: PASS\n' > "$TMP_DIR/host-review-fail-then-pass"
expect_block "FAIL followed by a PASS line blocks" 0 "$TMP_DIR/host-review-fail-then-pass"

# 4c. A suffix is not a PASS.
printf 'VERDICT: PASS WITH CHANGES\n' > "$TMP_DIR/host-review-pass-suffix"
expect_block "PASS with a suffix blocks" 0 "$TMP_DIR/host-review-pass-suffix"

# 5. No report at all (reviewer crashed, file never written).
expect_block "missing report blocks" 0 "$TMP_DIR/host-review-missing"

# 6. agent-night.sh must create the report itself, write it once and gate on it.
NIGHT="$REPO_ROOT/scripts/agent-night.sh"
if grep -qF 'HOST_REVIEW_OUT=$(mktemp' "$NIGHT"; then
  pass "night run creates its own report file"
else
  fail "night run creates its own report file"
fi
if grep -qF '>> "$HOST_REVIEW_OUT"' "$NIGHT"; then
  fail "night run does not append to the report file"
else
  pass "night run does not append to the report file"
fi
if grep -qF 'review_gate_passes "$REVIEW_EXIT" "$HOST_REVIEW_OUT"' "$NIGHT"; then
  pass "night run gates on reviewer exit status and report"
else
  fail "night run gates on reviewer exit status and report"
fi
if [ "$(grep -c '^ *review_loop "\$' "$NIGHT")" -eq 2 ]; then
  pass "task and follow-up path both go through review_loop"
else
  fail "task and follow-up path both go through review_loop"
fi

# 7. Auto-merge: small, low risk, allowed paths only.
printf 'VERDICT: PASS\nRISK: LOW\n' > "$TMP_DIR/low"
printf 'VERDICT: PASS\nRISK: HIGH\n' > "$TMP_DIR/high"
printf 'VERDICT: PASS\n' > "$TMP_DIR/norisk"
expect_merge() {
  local name="$1" want="$2" lines="$3" report="$4"
  shift 4
  if printf '%s\n' "$@" | automerge_allowed "$lines" "$report"; then got=yes; else got=no; fi
  if [ "$got" = "$want" ]; then pass "$name"; else fail "$name"; fi
}
expect_merge "small logic fix with LOW merges" yes 40 "$TMP_DIR/low" internal/git/blame.go internal/git/blame_test.go
expect_merge "core ts and docs merge" yes 60 "$TMP_DIR/low" frontend/src/core/indent.ts docs/04-testing.md
expect_merge "HIGH risk never merges" no 10 "$TMP_DIR/high" internal/git/blame.go
expect_merge "missing RISK line never merges" no 10 "$TMP_DIR/norisk" internal/git/blame.go
expect_merge "over the line limit never merges" no 101 "$TMP_DIR/low" internal/git/blame.go
expect_merge "UI component never merges" no 10 "$TMP_DIR/low" frontend/src/ui/Dock.tsx
expect_merge "CSS never merges" no 10 "$TMP_DIR/low" frontend/src/core/theme.css
expect_merge "path boundary never merges" no 10 "$TMP_DIR/low" internal/workspace/resolve.go
expect_merge "agent rules never merge" no 5 "$TMP_DIR/low" scripts/review-gate.sh
expect_merge "AGENTS.md never merges" no 5 "$TMP_DIR/low" AGENTS.md
expect_merge "app bindings never merge" no 5 "$TMP_DIR/low" app/workspace.go
expect_merge "empty file list never merges" no 0 "$TMP_DIR/low"

# 8. A task can opt out in its plan section.
mkdir -p "$TMP_DIR/docs/plans"
cat > "$TMP_DIR/docs/plans/p.md" <<'PLAN'
## Task: Blame cache
Auto-Merge: nein

## Task: Blame tooltip
Nothing special.
PLAN
if plan_allows_automerge "$TMP_DIR" "[docs/plans/p.md] Blame cache"; then
  fail "plan opt-out blocks auto-merge"
else
  pass "plan opt-out blocks auto-merge"
fi
if plan_allows_automerge "$TMP_DIR" "[docs/plans/p.md] Blame tooltip"; then
  pass "opt-out is scoped to its own task section"
else
  fail "opt-out is scoped to its own task section"
fi
if plan_allows_automerge "$TMP_DIR" "Task without plan"; then
  pass "task without plan is not vetoed"
else
  fail "task without plan is not vetoed"
fi

# PR body rules
expect_body() {
  local name="$1" want="$2" file="$3" got
  got=$(pr_body_problem "$file")
  if { [ "$want" = ok ] && [ -z "$got" ]; } || { [ "$want" = bad ] && [ -n "$got" ]; }; then
    pass "$name"
  else
    fail "$name (got: ${got:-nothing})"
  fi
}
printf '### Was wurde geändert?\n- a\n- b\n\n### Getestet\n- c\n\n### Manual Check (für das Review am Morgen)\n- d\n\n### Hinweise\n- e\n' > "$TMP_DIR/body-ok"
expect_body "template body passes" ok "$TMP_DIR/body-ok"
{ echo '### Was wurde geändert?'; for i in $(seq 1 13); do echo "- line $i"; done; } > "$TMP_DIR/body-long"
expect_body "13 text lines fail" bad "$TMP_DIR/body-long"
{ echo '### Was wurde geändert?'; for i in $(seq 1 12); do echo "- line $i"; echo; done; } > "$TMP_DIR/body-12"
expect_body "12 text lines with blank lines pass" ok "$TMP_DIR/body-12"
printf '### Was wurde geändert?\n- a\n\n### Entscheidungen\n- b\n' > "$TMP_DIR/body-heading"
{ echo '### Was wurde geändert?'; for i in 1 2 3; do printf -- '- %s\n' "$(printf 'wort %.0s' $(seq 1 51))"; done; } > "$TMP_DIR/body-wordy"
expect_body "three 51-word bullets fail" bad "$TMP_DIR/body-wordy"
expect_body "unknown heading fails" bad "$TMP_DIR/body-heading"
printf '### Getestet\n- a\n' > "$TMP_DIR/body-nochange"
expect_body "missing change section fails" bad "$TMP_DIR/body-nochange"
: > "$TMP_DIR/body-empty"
expect_body "empty body fails" bad "$TMP_DIR/body-empty"

# Host report summary for the PR comment
printf 'VERDICT: PASS\nRISK: HIGH\nBLOCKER\nSHOULD-FIX\nDECISION\nNIT\n- a.go:1 — kurz\nCHECKED\n- lots\nNOT CHECKED\n- more\n' > "$TMP_DIR/summary-in"
got=$(review_summary "$TMP_DIR/summary-in")
want=$(printf 'VERDICT: PASS\nRISK: HIGH\n\n**NIT**\n- a.go:1 — kurz')
if [ "$got" = "$want" ]; then pass "summary keeps verdict and findings only"; else fail "summary keeps verdict and findings only (got: $got)"; fi

# Tree snapshot ignores the index but sees untracked files
REPO="$TMP_DIR/repo"
git init -q "$REPO" && (cd "$REPO" && echo a > f && git add f && git -c user.name=t -c user.email=t@t commit -qm init)
t1=$(cd "$REPO" && worktree_tree)
t2=$(cd "$REPO" && echo b > new && worktree_tree)
if [ "$t1" != "$t2" ] && [ -z "$(cd "$REPO" && git diff --cached --name-only)" ]; then
  pass "tree snapshot sees untracked files and leaves the index alone"
else
  fail "tree snapshot sees untracked files and leaves the index alone"
fi

echo
if [ "$FAILED" -ne 0 ]; then
  echo "$FAILED of $CHECKS checks failed."
  exit 1
fi
echo "All $CHECKS checks passed."
