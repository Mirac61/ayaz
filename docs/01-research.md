# 01 – Research

Updated 2026-11-08. Versions come from registries and release pages, not from memory.

Facts were checked against the linked source unless marked *(unverified)*. **Spike Sx** means it gets measured in M0 before the decision is final.

Each section ends with the decision. The full reasoning behind each decision lives in the matching ADR.

## Versions

| Component | Version | Notes |
|---|---|---|
| Wails v3 | 3.1.0 | 3.0.0 was the first stable v3 (2026-10-26) |
| Wails v2 | 2.17.1 | critical fixes only |
| Tauri | 2.12.5 stable, 3.0.0-alpha.6 | for comparison only |
| Go (local) | 1.27.3 | |
| Bun | 1.4.4 | |
| `@codemirror/view` | 6.43.15 | |
| `@codemirror/lang-markdown` | 6.5.2 | uses `@lezer/markdown` ^1.0.0 |
| `@replit/codemirror-vim` | 6.4.0 | |
| `@codemirror/lsp-client` | 6.3.0 | |
| `@codemirror/search` | 6.7.2 | |
| `@codemirror/lang-go` / `-cpp` / `-java` | 6.0.1 / 6.0.3 / 6.0.2 | |
| `@codemirror/lang-javascript` / `-html` / `-css` / `-json` / `-yaml` | 6.2.5 / 6.4.12 / 6.3.1 / 6.0.2 / 6.1.3 | |
| `@codemirror/legacy-modes` | 6.5.5 | |
| `pdfjs-dist` | 6.5.438 | Apache-2.0, ~37.6 MB unpacked |
| `@xterm/xterm` | 6.0.0 | |
| `creack/pty` (Go) | 1.1.24 | |
| `fsnotify` (Go) | 1.10.1 | |
| `sgtdi/fswatcher` (Go) | v2 | needs Go ≥ 1.27.3 |
| `fzf` (npm, fzf-for-js) | 0.5.2 | *(unverified)* |

---

## 1. Wails v2 vs. v3

| | v2 | v3 |
|---|---|---|
| Status | maintenance only | stable since 2026-10-26 |
| Multiple windows | no | yes |
| Backend API | runtime package, ctx-bound bindings | services with `ServiceStartup` / `ServiceShutdown` |
| Bindings | generated | static analysis; doc comments, param names and Go structs/enums end up in TS |
| Linux | GTK3 / WebKit2GTK 4.x | GTK4 + WebKitGTK 6.0 (GTK3 via `-tags gtk3`) |
| Build | `wails.json` | Taskfile; package manager set via `PACKAGE_MANAGER` (exact syntax unverified) |
| E2E testing | – | server build (`-tags server`), made for Playwright |
| Go | – | ≥ 1.26 |

- **For v3:** Wails recommends it for new projects, server build for E2E, GTK4 is Wayland-native, better bindings.
- **Against v3:** only two weeks stable. Minor versions "advance with time, not with features", so a minor bump says nothing about compatibility. Some open Linux bugs (§3).
- Don't use the experimental CGO-free backend from 3.1.0.

**Decision:** v3, pinned to an exact version, upgrades one at a time on purpose. → [ADR-0001](adr/0001-wails-v3.md)

Sources: [Releases](https://github.com/wailsapp/wails/releases) · [v3.0.0 notes](https://github.com/wailsapp/wails/releases/tag/v3.0.0) · [v3.1.0 notes](https://github.com/wailsapp/wails/releases/tag/v3.1.0) · [Blog](https://wails.io/blog/wails-v3-released/) · [pkg.go.dev](https://pkg.go.dev/github.com/wailsapp/wails/v3) · [Lifecycle](https://v3.wails.io/concepts/lifecycle/) · [Build customization](https://v3.wails.io/guides/build/customization/)

---

## 2. Wails vs. Tauri

| | Wails v3 | Tauri 2.12 |
|---|---|---|
| Backend | Go | Rust |
| Maturity | freshly stable | stable since Oct 2024, bigger community |
| WebView macOS | WKWebView | WKWebView |
| WebView Linux | WebKitGTK 6.0 (GTK4) | WebKitGTK via wry (GTK3) |
| Chromium on Linux | no | only Tauri 3 alpha with CEF; Linux packages currently broken, 187–455 MB |
| Security model | bindings callable by any code in the WebView, even iframes | per-window capabilities |

- On Linux both use the same engine (WebKitGTK), so Tauri has no rendering advantage while CEF is alpha.
- Go is the chosen backend language, and process management and file watching are easy in Go.
- Tauri's security model matters because we render foreign Markdown. With Wails we compensate: no raw HTML, strict CSP ([02 Security](02-architecture.md#security)).

**Decision:** Wails v3. Revisit Tauri only if WebKitGTK turns out unusable and Tauri + CEF is stable by then. → [ADR-0001](adr/0001-wails-v3.md)

Sources: [docs.rs tauri](https://docs.rs/crate/tauri/latest) · [Tauri releases](https://github.com/tauri-apps/tauri/releases) · [schreibzeug #10 (CEF)](https://github.com/firsttris/schreibzeug/pull/10) · [athas #767 (CEF reverted)](https://github.com/athasdev/athas/pull/767) · [tauri #16474](https://github.com/tauri-apps/tauri/issues/16474)

---

## 3. WebKitGTK on Linux/Wayland

**Known problems**
- **NVIDIA + DMA-BUF renderer:** blank window or "Gdk Error 71" under Hyprland (WebKit bug 280210).
- Workarounds and their cost:
  - `WEBKIT_DISABLE_DMABUF_RENDERER=1` / `WEBKIT_DISABLE_COMPOSITING_MODE=1` → CPU painting, 40–90 ms per frame when scrolling. Not acceptable for an editor.
  - `WEBKIT_DMABUF_RENDERER_FORCE_SHM=1` keeps DMA-BUF but uses shared memory. Reported as the better NVIDIA compromise *(unverified)*.
  - Intel/AMD with current Mesa: leave DMA-BUF on, reportedly smooth.
- **Wails on GTK4:**
  - #6505: a closed window leaves its WebKitWebProcess running (~50 MB each). Matters once we have multiple windows (§14).
  - #6257: resizing frameless windows jumps → no frameless window on Linux (pointless under Hyprland anyway).
  - Needs GTK ≥ 4.10.
- No independent GTK3 vs. GTK4 benchmarks found. WebKit is generally slower than Chromium at JS and layout *(unverified)*.

**WebGL** (matters for the terminal, §11): WebKitGTK creates WebGL2 contexts even on a software rasterizer and masks the renderer string, so we can't detect what actually renders.

**My hardware is Intel UHD.** The serious bugs are NVIDIA-only, so: no env workarounds, GPU path stays on. Still verified in Spike S1.

**Decision**
- No env workarounds by default.
- No frameless window.
- Keep the DOM small (virtualized tree and lists; CM6 already renders only the viewport). Helps everywhere, more on Linux.
- Measure pdf.js scrolling (S3) and xterm.js WebGL vs. DOM (S6) under WebKitGTK.

Sources: [wails #4957](https://github.com/wailsapp/wails/issues/4957) · [#6505](https://github.com/wailsapp/wails/issues/6505) · [#6257](https://github.com/wailsapp/wails/issues/6257) · [#4985](https://github.com/wailsapp/wails/issues/4985) · [tauri-explorer #1057](https://github.com/xnmp/tauri-explorer/issues/1057) · [Carrier #400](https://github.com/kristofferR/Carrier/pull/400) · [euro-office-lite #65](https://github.com/delmarguillen/euro-office-lite/issues/65)

---

## 4. CodeMirror 6 + Vim

**Options**
- `@replit/codemirror-vim`: port of the CM5 Vim engine, the core now lives in the editor-independent `@replit/codemirror-vim-core`. Effectively the only maintained Vim for CM6.
- Own Vim implementation: endless edge cases. No.
- **Embed real Neovim** (`nvim --embed`, like vscode-neovim): perfect Vim and my own config, but then there are two copies of the buffer. CM6 needs the text for live preview, decorations and LSP, so every edit, cursor and selection must be synced, and the live preview would fight Neovim's rendering. Rejected.

**Risk: "feels like nvim".** This is the biggest product risk. Macros, registers, `.`, marks, visual block and `:s` should exist in codemirror-vim *(unverified against the current version)*. In M1 the Vim features I use daily become browser tests, so gaps show up before much is built on top.

**API we rely on**
- `vim({ status? })` as the first extension, before other keymaps.
- `Vim.map` / `Vim.unmap` for mappings, `Vim.defineEx` for `:w`, `:e`, `:q`.
- `Vim.defineOperator`, `Vim.defineMotion`, `Vim.defineAction`, `Vim.mapCommand` (the last three are documented only in the CM5 manual).
- Event `vim-mode-change` feeds the status line. Block cursor is built in.
- Anything that should combine with operators (`d` + custom motion) must be a **motion**, not an action.

**Decision:** `@replit/codemirror-vim`, wrapped in `editor/vim`. Ex commands and leader mappings call the command registry. Global shortcuts always use a modifier (`Cmd`/`Ctrl`), the leader is `<Space>`. PDF and image viewers get their own small keymap (`j/k/gg/G/ /n/N`). → [ADR-0002](adr/0002-codemirror-vim.md)

Sources: [README](https://github.com/replit/codemirror-vim/blob/master/packages/codemirror-vim/README.md) · [index.ts](https://github.com/replit/codemirror-vim/blob/master/packages/codemirror-vim/src/index.ts) · [CM5 Vim API](https://codemirror.net/5/doc/manual.html) · [motion vs. action](https://newreleases.io/project/github/saberzero1/motions/release/0.128.0)

---

## 5. Markdown live preview in CM6

| Parser | Pro | Con |
|---|---|---|
| Lezer via `@codemirror/lang-markdown` | already there for highlighting, incremental, gives positions for decorations, GFM | we render HTML from the tree ourselves |
| markdown-it / remark on top | reference CommonMark, ready HTML renderer | second parser, positions must be mapped |

**How it works** (from the CM forum and several implementations)
- Inline: a `ViewPlugin` walks `syntaxTree` over `view.visibleRanges` only.
- Markers (`HeaderMark`, `EmphasisMark`, `CodeMark`, `LinkMark`, `QuoteMark`) are hidden with `Decoration.replace`, **unless** the selection touches that line (Obsidian behavior).
- `EditorView.atomicRanges` makes the cursor skip hidden ranges.
- Block widgets (tables, images) **must** come from a `StateField`, not a ViewPlugin.
- Rebuild on `docChanged`, `selectionSet`, `viewportChanged`.

Worth reading, not copying: codemirror-rich-markdoc, atomic-editor, codemirror-live-markdown (design doc).

**Decision:** one parser (Lezer), our own extension `md-live`, a good module to write myself. Decorations computed by a pure function `(state, ranges) → DecorationSet` so they're testable without a DOM. The separate preview renders the same Lezer tree to DOM. → [ADR-0003](adr/0003-markdown-live-preview.md)

Sources: [Concealing syntax](https://discuss.codemirror.net/t/concealing-syntax/3135) · [Hide markdown syntax](https://discuss.codemirror.net/t/hide-markdown-syntax/7602) · [rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc) · [atomic-editor](https://github.com/kenforthewin/atomic-editor) · [live-markdown design](https://github.com/blueberrycongee/codemirror-live-markdown/blob/main/CODEMIRROR_LIVE_PREVIEW_DESIGN.md)

---

## 6. pdf.js

| Option | Pro | Con |
|---|---|---|
| A: Mozilla's `viewer.html` in an iframe | complete | foreign UI and keys, hard to theme, iframe can reach the bindings |
| **B: `PDFViewer` from `pdfjs-dist/web/pdf_viewer`** | lazy rendering, text layer, search, zoom; our UI | the web component API is less stable than the core API *(unverified)* |
| C: own renderer on `getDocument` + `page.render` | full control | build lazy loading, text layer, search ourselves |

**Facts**
- `PDFViewer({ container, eventBus, linkService, findController, ... })`. The container must be absolutely positioned. Core and viewer versions must match exactly.
- Search via `PDFFindController` (`find` event, results via `updatefindmatchescount`). Zoom via `currentScaleValue`.
- Large files: pdf.js only loads needed parts if the server supports Range requests. macOS passes Range headers through custom schemes; WebKitGTK is unknown (Spike S2). Fallback: load the whole file (5–50 MB for 200 pages, fine).
- `maxCanvasPixels` caps memory per page at high zoom.

**Decision:** option B, loaded with dynamic `import()` on the first PDF, no scripting/forms. → [ADR-0004](adr/0004-pdfjs-viewer.md)

Sources: [pdf.js](https://github.com/mozilla/pdf.js) · [pdfjs-dist](https://github.com/mozilla/pdfjs-dist) · [WebKit bug 203302](https://bugs.webkit.org/show_bug.cgi?id=203302)

---

## 7. Serving local files to the WebView

**Facts**
- Assets are configured app-wide via `application.Options.Assets` with `AssetOptions{ Handler, Middleware }`.
- Middleware behaves the same in dev and prod. On macOS everything goes through the `wails://` scheme, no open port.
- The asset server supports Range if the `fs.FS` returns an `io.Seeker`. 3.1.0 fixed HEAD/Range/MIME issues.
- The Wails maintainers advise against `file://` and recommend a custom handler restricted to a directory.

| Option | Pro | Con |
|---|---|---|
| `file://` | trivial | security model, cross-origin issues, access to everything |
| Base64 via bindings | no HTTP | ×1.33 memory, slow, no streaming |
| **Middleware route `/fs/<path>`** | `http.ServeContent` gives Range, ETag, MIME, conditional requests for free; `<img>` and pdf.js just work | path validation must be right (traversal, symlinks) |

Relative Markdown paths (`![](img/a.png)` in `notes/x.md`) are resolved in the frontend to `/fs/notes/img/a.png`. Go checks again that the path is inside the workspace (validation at the trust boundary).

**Decision:** `/fs/<workspace-id>/<path>` with a workspace jail. Editor text still goes through bindings (encoding detection, mtime for conflict checks). → [ADR-0005](adr/0005-file-serving.md)

Sources: [AssetOptions](https://v3.wails.io/guides/gin-routing/) · [Custom transport](https://v3.wails.io/guides/custom-transport/) · [Asset server](https://wails.io/contributing/asset-server/) · [Discussion #1538](https://github.com/wailsapp/wails/discussions/1538) · [PR #2091](https://github.com/wailsapp/wails/pull/2091) · [#6530](https://github.com/wailsapp/wails/issues/6530)

---

## 8. LSP

**Client libraries**
- **`@codemirror/lsp-client`** (official, by the CM author): diagnostics via `@codemirror/lint`, completion, hover. Brings `marked` for hover Markdown.
- `codemirror-languageserver` (marimo fork) and `val-town/vtlsp`: different APIs, own WebSocket transports.

The `@codemirror/lsp-client` transport is an object with `send(message)`, `subscribe(handler)`, `unsubscribe(handler)`. Messages are JSON strings **without** `Content-Length` framing.

**Go side:** start the server (`os/exec`), read/write `Content-Length` frames on stdin/stdout, log stderr. One process per language and workspace, restart with backoff, shut down on exit.

**Bridge options**
- **Wails streams** (`app.HandleStream` in Go, `Stream(name)` in JS): ordered, bidirectional, no TCP port, made for byte streams.
- Wails events: not meant for request/response traffic of this size *(unverified)*.
- WebSocket on localhost: open port, needs a token.

**Servers** (installed by the user, found via `PATH`)

| Language | Server | Note |
|---|---|---|
| Go | `gopls` | `go install golang.org/x/tools/gopls@latest` |
| C/C++ | `clangd` | needs `compile_commands.json` for correct includes |
| TS/JS | `typescript-language-server` | needs `typescript` |
| HTML/CSS/JSON | `vscode-langservers-extracted` | one package, three servers |
| Java | `jdtls` | needs a JVM, lots of RAM, slow start *(unverified)* |

Formatting goes through LSP (`textDocument/formatting`). gopls and clangd format themselves.

**Decision:** `@codemirror/lsp-client` over Wails streams (one stream per server), framing written in Go. → [ADR-0009](adr/0009-lsp-bridge.md)

Open: stream latency and throughput (Spike S7). Whether the client handles several documents per server and cross-file rename (check in M7).

Sources: [lsp-client](https://github.com/codemirror/lsp-client) · [vtlsp](https://github.com/val-town/vtlsp) · [Wails events](https://v3.wails.io/guides/events-reference/)

---

## 9. File watching

| Library | macOS | Linux | Recursive | Debounce | Status |
|---|---|---|---|---|---|
| `fsnotify` | kqueue, **one FD per file** | inotify | no | no | established |
| `sgtdi/fswatcher` v2 | FSEvents (CGO) | inotify | yes | yes (100 ms default) | young (~5 months), CI on all backends |
| `rjeczalik/notify` | FSEvents | inotify | yes | no | last release 2023 |

- kqueue with 50,000 files needs 50,000 FDs, so fsnotify doesn't work for repos on macOS.
- Editors save atomically (temp + rename): watch directories, not files.
- fswatcher reports `EventOverflow`; then rescan.
- Spotlight causes chmod noise → ignore chmod.
- inotify watch limits (`fs.inotify.max_user_watches`) can hit large repos.

**Decision:** `sgtdi/fswatcher` v2 behind our own `watch.Watcher` interface so a switch touches one file. Exclude `.git/` and `node_modules/`. Suppress our own writes briefly. → [ADR-0006](adr/0006-file-watching.md)

Sources: [fsnotify](https://github.com/fsnotify/fsnotify) · [fswatcher](https://github.com/sgtdi/fswatcher) · [notify](https://pkg.go.dev/github.com/rjeczalik/notify)

---

## 10. Smaller topics

**Fuzzy finder:** `fzf-for-js` exists but hasn't changed in a year. Writing our own matcher in Go (fzf-like scoring) is small, testable and benchmarkable. → [ADR-0007](adr/0007-fuzzy-in-backend.md), latency in Spike S4.

**Bun + tests:** Vitest instead of `bun test`, because CM6 needs browser mode ([04](04-testing.md)). → [ADR-0008](adr/0008-bun-vitest.md)

**Wails streams:** `Stream` sends bytes (`ev.data` is always an `ArrayBuffer`), `JSONStream` encodes JSON. Used for the terminal and LSP. [Example](https://pkg.go.dev/github.com/wailsapp/wails/v3/examples/streams) · [Raw messages](https://wails.io/guides/raw-messages/)

**Kanagawa:** variants wave (default), dragon (darker), lotus (light). Palette in `lua/kanagawa/colors.lua`. Check the license of [kanagawa.nvim](https://github.com/rebelot/kanagawa.nvim) before copying hex values.

---

## 11. Terminal

Requirement: a **real** terminal, meaning full VT emulation, TUI programs, truecolor, mouse, Unicode.

| Layer | Choice |
|---|---|
| Emulator | `@xterm/xterm` 6.0.0 (what VS Code uses) |
| Renderer | DOM or WebGL addon. The canvas renderer was removed in 6.0. |
| Addons | fit, search, web-links, unicode11, clipboard, image, serialize |
| PTY | `creack/pty`, the Go standard |
| Transport | Wails streams |

- xterm.js 6 adds synchronized output (no TUI flicker) and OSC52 clipboard. Breaking: Alt no longer maps to Ctrl+arrow, embedders set their own keybindings.
- WebGL is normal on macOS (but bug #5816 on macOS 26.5 beta). On WebKitGTK we can't check what renders (§3), so other projects default to DOM there.
- A Tauri terminal measured that the bottleneck was **one IPC message per PTY read**, not the renderer. After batching, WebGL saved 26 % UI CPU on `seq`, but was 14 % slower on `cat` of a huge file.

**Design consequences**
- Batch PTY output in Go (e.g. every 4–8 ms or at 16 KB; tune in S6).
- Renderer configurable, default per platform after measuring (expected: macOS WebGL, Linux DOM).
- Shell configurable, default `$SHELL -l`. My own shell `mysh` just works, since we only start a program in a PTY. cwd = workspace root, `TERM=xterm-256color`, `COLORTERM=truecolor`.
- Terminal font configurable (Nerd Font glyphs for the mysh prompt).
- Resize: the frontend reports cols/rows, Go calls `pty.Setsize`.
- When the shell exits, the pane shows the status and a key closes it.
- Keys: all go to the shell. `Ctrl-\ Ctrl-n` leaves to a normal mode for scrollback/copy, like nvim.
- Kanagawa colors as the xterm theme.

**Decision:** xterm.js 6 + creack/pty + Wails streams, the terminal is a normal provider in a pane (like `:terminal` in nvim). → [ADR-0013](adr/0013-terminal.md)

Sources: [xterm.js releases](https://github.com/xtermjs/xterm.js/releases) · [#5816](https://github.com/xtermjs/xterm.js/issues/5816) · [fantastic #52](https://github.com/aisixteen/fantastic/issues/52) · [emberterm #6](https://github.com/emberterm/emberterm/pull/6) · [creack/pty](https://github.com/creack/pty)

---

## 12. Languages and highlighting

| Language | Package |
|---|---|
| Go, C/C++, Java | `@codemirror/lang-go`, `-cpp`, `-java` |
| TS/JS/JSX | `@codemirror/lang-javascript` |
| HTML, CSS, JSON, YAML | `lang-html`, `lang-css`, `lang-json`, `lang-yaml` |
| Shell, TOML, Dockerfile, Makefile | `@codemirror/legacy-modes` via `StreamLanguage` (no syntax tree) |

- Each language package is loaded with `import()` the first time a matching file opens.
- One table (`lang/registry.ts`) maps extension/filename → language. The same table picks the LSP server.
- Lezer grammars give highlighting, indentation, folding and bracket matching. Semantic highlighting via LSP is optional and unclear in `@codemirror/lsp-client`.
- Tree-sitter (WASM) rejected: a second parser world next to Lezer with no gain for these languages.

→ [ADR-0015](adr/0015-languages.md)

---

## 13. Project search and replace

| Option | Pro | Con |
|---|---|---|
| `ripgrep` subprocess | very fast, knows `.gitignore` | system dependency, second set of ignore rules |
| **Own search in Go** over the index file list | same files as the fuzzy finder, stdlib `regexp`, parallel, streamed | probably slower than rg (measure in M8) |

- Skip binary files (NUL byte in the first 8 KB) and very large files.
- Stream results to the frontend so the first hits show immediately (K15).
- Replace: preview all changes, then write each file the same atomic way as `:w`. Open buffers are changed in the buffer, not on disk.
- Results go into the quickfix list (`:cn`/`:cp`), the same list later used by builds and LSP references.

**Decision:** own Go search. If it clearly misses K15, use `rg` when installed. → [ADR-0016](adr/0016-project-search.md)

---

## 14. Multiple windows

- Wails v3 supports several windows in one process.
- Linux leak #6505 (~50 MB per closed window) may or may not be fixed in 3.1.
- **One process, many windows, one workspace per window:** native behavior (one Dock icon), Go keeps a map `WorkspaceID → Workspace`.
- One process per window: simpler, but several Dock icons on macOS and no shared "recent folders".
- Switching folders in a window = tear down the old workspace (buffers, watcher, LSP, terminals), build the new one. Ask first if there are unsaved buffers.

**Decision:** one process, one workspace per window, workspace ID in every binding, stream and `/fs/` URL. → [ADR-0014](adr/0014-multiple-windows.md)

## Spike results (M0)

### S1 – Wails v3 window + scroll test (2026-11-08)

- **macOS (ProMotion):** Wails v3.1.0 starts, binary 9.2 MB. WebKit caps `requestAnimationFrame` at 60 fps by default; turning off the internal flag `PreferPageRenderingUpdatesNear60FPSEnabled` (`app/framerate_darwin.go`, private API, looked up defensively) gives 120 fps. Scrolling 10,000 non-virtualized DOM rows: steady 120 fps, once a short dip to ~90 (cause not measured).
- **Hyprland / Intel UHD:** open.
