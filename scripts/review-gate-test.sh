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

# 1. A PASS the implementer wrote into its own report is not a host verdict.
printf 'VERDICT: PASS\n' > "$TMP_DIR/ayaz-review-7.md"
: > "$TMP_DIR/host-review-fresh"
expect_block "implementer PASS alone blocks" 0 "$TMP_DIR/host-review-fresh"

# 2. The host reviewer failed, even though its report claims PASS.
printf 'VERDICT: PASS\n' > "$TMP_DIR/host-review-failed"
expect_block "PASS from a failed reviewer blocks" 1 "$TMP_DIR/host-review-failed"

# 3. The host reviewer passed.
printf 'VERDICT: PASS\n' > "$TMP_DIR/host-review-pass"
expect_allow "PASS from a clean reviewer passes" 0 "$TMP_DIR/host-review-pass"

# 4. The reviewer reported a problem.
printf 'VERDICT: FAIL\nBLOCKER: race in watcher\n' > "$TMP_DIR/host-review-verdict-fail"
expect_block "FAIL verdict blocks" 0 "$TMP_DIR/host-review-verdict-fail"

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
  fail "night run appends to the report file"
else
  pass "night run appends to the report file"
fi
if grep -qF 'review_gate_passes "$REVIEW_EXIT" "$HOST_REVIEW_OUT"' "$NIGHT"; then
  pass "night run gates on reviewer exit status and report"
else
  fail "night run gates on reviewer exit status and report"
fi

echo
if [ "$FAILED" -ne 0 ]; then
  echo "$FAILED of $CHECKS checks failed."
  exit 1
fi
echo "All $CHECKS checks passed."
