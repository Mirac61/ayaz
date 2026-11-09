# ADR-0014: Multiple windows in one process, one workspace per window

Status: accepted · 2026-11-09 (window ↔ workspace through the binding ctx, not a URL parameter; #6505 not checked yet)

## Context
- Wanted: VS Code behavior. Open another folder in the window, or open a new window.
- Multi-root (several folders in one window) is not wanted.
- Wails v3 supports multiple windows. On Linux/GTK4 there's a reported leak per closed window (#6505, ~50 MB).

## Options
1. **One process, many windows, a workspace ID per window**
2. One process per window: simplest isolation, but several Dock icons on macOS and a Go runtime per window.
3. Only one window: doesn't meet the requirement.

## Decision
Option 1. Each window gets a workspace ID when it opens (e.g. as a URL parameter). `backend.ts` adds it to every call; `/fs/` and stream names include it. Switching folders = `Close(ws)` + `Open(root)`.

## Consequences
- \+ Native behavior, one Dock icon, shared recent-folders list.
- \+ A workspace owns everything (watcher, index, LSP, PTYs). Tearing it down is one call, covered by tests (no orphaned processes).
- − Every service method needs the `ws` parameter.
- − Leak #6505 on Linux: check before M13 whether it's fixed. If not, hide and reuse windows instead of closing them.
- A crash in the Go process takes all windows down. Accepted.
