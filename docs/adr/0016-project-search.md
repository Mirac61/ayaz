# ADR-0016: Project search in Go, written ourselves

Status: accepted · 2026-11-09 (K15 met, see perf-log)

## Context
- Project-wide search and replace is part of a code editor.
- Budget K15: first hits ≤ 100 ms, done ≤ 2 s on 50,000 files.
- The index (ADR-0007) already knows all relevant files and ignore rules.

## Options
1. `ripgrep` as a subprocess: very fast, but a system dependency and a second set of ignore rules.
2. **Own search in Go** over the index file list: `regexp`/`bytes.Index`, worker pool, streamed results.

## Decision
Option 2. Skip binary and very large files. Results go into the quickfix list. Replace goes through open buffers or the atomic write path.

## Consequences
- \+ Same file set as the fuzzy finder, no surprises.
- \+ Well-scoped module to learn from (concurrency, streaming, benchmarks against `rg`).
- − Probably slower than ripgrep. If K15 misses, `rg` becomes an optional backend behind the same interface.
- − Go `regexp` (RE2) has no lookarounds or backreferences. Fine for editor search.
