#!/usr/bin/env bash
# Decision for the host review gate in scripts/agent-night.sh.
#
# Sourced by agent-night.sh and by scripts/review-gate-test.sh. Only the report
# of the host-invoked reviewer may be passed in: the implementer's own review
# report, $REVIEW_OUT, is no proof, because the implementer can write it.

# review_gate_passes <reviewer-exit-status> <report-file>
# Passes only when the reviewer exited cleanly and its report says PASS.
review_gate_passes() {
  local exit_code="$1"
  local report="$2"

  [ "$exit_code" -eq 0 ] || return 1
  [ -s "$report" ] || return 1
  grep -q '^VERDICT: PASS' "$report"
}
