# ADR-0006: File watching with sgtdi/fswatcher v2 behind our own interface

Status: proposed · 2026-11-08

## Context
- File tree, index and open buffers must notice external changes (git checkout, another editor).
- Repos with 50,000 files must work.

## Options
1. `fsnotify`: established, but on macOS kqueue needs one FD per file, not recursive, no debounce.
2. **`sgtdi/fswatcher` v2**: FSEvents on macOS (CGO), inotify on Linux, recursive, built-in debounce, overflow signal. Young (~5 months).
3. `rjeczalik/notify`: FSEvents, recursive, last release 2023.
4. Polling: simple, but CPU load and latency on big repos.

## Decision
Option 2 behind `internal/watch.Watcher` (one implementation file per library). Excludes `.git/`, `node_modules/`, later the index rules (Q26 in [06](../06-open-questions.md)).

## Consequences
- \+ FSEvents scales without the FD problem, no own debounce needed.
- − CGO on macOS. Wails needs CGO there anyway.
- − Young project with few users. The interface keeps a switch small; the fallback is fsnotify with our own recursive walk on Linux.
- Our own writes must be filtered (path + time window), otherwise every `:w` shows up as an external change.
- Overflow → full rescan of the affected subtree.

## Implementation notes (M3)
- `internal/watch.Start(ctx, root, fn)` is the interface; fswatcher is only used in `watch.go`. Hidden files are watched (`WithHidden`), `.git/`, `node_modules/` and our save temp files (`.*.ayaz-*`) are excluded.
- Self-write filter is by **mtime, not time window**, in the frontend: a buffer whose mtime matches disk does nothing. Own saves still reach the tree and the index, so a new file from `:w` shows up.
- Overflow sends `rescan: true`; the frontend then re-lists every loaded folder and checks every buffer.
- The index is dropped per batch and rebuilt on the next Find, not patched (K10 holds).
