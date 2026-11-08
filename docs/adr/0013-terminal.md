# ADR-0013: Terminal with xterm.js, creack/pty and Wails streams

Status: proposed · 2026-11-08

## Context
- A real terminal is a core requirement: TUI programs, truecolor, mouse, Unicode.
- Only macOS and Linux, so a Unix PTY is enough.
- Another terminal (Tauri) measured that the bottleneck wasn't the renderer but one IPC call per PTY read.

## Options
Emulator:
1. **`@xterm/xterm` 6.0.0**: full emulation, synchronized output, OSC52, addons. Canvas renderer removed; DOM and WebGL remain.
2. Own VT parser: way too much work.
3. Embed a native terminal (e.g. libghostty): can't be drawn inside a WebView pane.

PTY: **`creack/pty`**, the Go standard.

Transport:
1. **Wails streams**: bytes, ordered, bidirectional, no port.
2. Events: not meant for byte streams.
3. WebSocket on localhost: port + token.

## Decision
xterm.js 6 + creack/pty + one Wails stream per terminal session. Go batches PTY output (window/size tuned in Spike S6). Renderer configurable, default per platform after measuring. The terminal is a normal provider in a pane.

## Consequences
- \+ Works like nvim: a buffer in a split, with insert and normal mode.
- \+ Same pattern (process + stream) as LSP and later DAP.
- − xterm.js 6 changed Alt key handling, so we need our own keybindings.
- − WebGL on WebKitGTK can't be detected reliably → likely DOM renderer by default there.
- − Throughput (K14) depends on stream overhead and renderer; both measured in S6.
- Shell and arguments are configurable (default `$SHELL -l`). A custom shell like `mysh` needs nothing special.
- Shell processes belong to the workspace and get SIGHUP (process group) when the window closes.
