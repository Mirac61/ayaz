# ADR-0007: File index and fuzzy matching in Go, written ourselves

Status: **accepted** · 2026-11-08 (S4: binding round trip p95 0.35 ms with 50 results on macOS)

## Context
- Fuzzy finder over up to 50,000 paths, ≤ 30 ms per keystroke (K9).
- The index must stay current on file changes, and those events arrive in Go.

## Options
1. Index in Go, list sent once to the frontend, matching with `fzf` (npm) in a web worker.
2. **Index and matching in Go**; the frontend calls `Query(q, limit)` per keystroke.
3. External tools (`fd`, `fzf`) as subprocesses: system dependency, a process start per query.

## Decision
Option 2 with our own matcher (subsequence match, bonus for filename, segment start, CamelCase, consecutive hits). Results include match positions for highlighting.

## Consequences
- \+ No copy of the list in the WebView (saves RAM, K2), index updates stay in Go.
- \+ Well-scoped module to learn from; benchmarks and fuzzing come for free.
- − One binding call per keystroke, latency measured in S4: p95 0.35 ms on macOS, Linux still open. If too slow: option 1, and the matcher moves along as an algorithm.
- − Our matcher will rank worse than fzf at first. Accepted; rankings improve through test cases (query → expected top hit).
