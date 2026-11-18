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
