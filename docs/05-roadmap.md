# 05 – Roadmap

Updated 2026-11-08 · Each milestone is a vertical slice: afterwards the app starts and can do a bit more than before.

- **[Own]** = I write it myself: worth learning, well-scoped, testable.
- **[Glue]** = wire up a library, little logic of our own.
- Every milestone also has to meet [When is a milestone "tested"?](04-testing.md#when-is-a-milestone-tested).

**Order:** first an editor with terminal and Markdown live preview I can use every day (M1–M6), then LSP and project search (M7–M9), then images and PDF (M10–M12), then windows and packaging (M13–M14). Markdown comes before LSP on purpose (Q27). The terminal comes early (M4) because it's a core requirement and sets up the stream pattern for LSP. File watching comes before it (M3), otherwise things done in the terminal (`git checkout`, codegen) never reach the editor.

![Milestones in order](diagrams/roadmap.svg)

---

## M0 – Skeleton, measuring, spikes

**Goal:** an empty Wails v3 window with a Kanagawa background. Build and measurements work on both platforms.

**Order (riskiest first):** S1 → ping + S4 → Kanagawa → S6/S7 → harness → CI → S5. If S1 fails on Hyprland, stop and revisit ADR-0001 before anything else.

- [Glue] `wails3 init` (React TS template), pin the version, switch the Taskfile to Bun.
- [Glue] Folder layout from [02](02-architecture.md#folder-layout-planned), `backend.ts` with a ping binding.
- [Glue] Kanagawa tokens as CSS variables.
- [Glue] CI skeleton: only the `go` job and Vitest Node from [04](04-testing.md#ci-github-actions). Browser, E2E and build jobs join in M1.
- [Own] Measuring harness: `AYAZ_EXIT_ON_READY`, `app:ready` event, RAM script for the process tree (`ps`, macOS + Linux).
- Spikes are built **into the skeleton** where possible (no separate apps). Throwaway parts live in `spikes/`, results go into `01-research.md`:
  - **S1:** Wails v3 on Hyprland/Intel UHD: starts, GPU path on, scroll test with 10,000 DOM rows (inside the skeleton).
  - **S4:** binding round-trip latency (empty call, 50 results), measured on the ping binding.
  - **S6 + S7 (one spike):** xterm.js + creack/pty + stream: K13/K14 with DOM and WebGL renderers on both platforms, batching parameters. Then the same stream path as an echo for LSP-like messages (K16), also in the server build.
  - **S5:** Vitest browser mode with WebKit under Bun. Time box 1 h; if it fails, run Vitest under Node and note it in ADR-0008.
- Moved: **S2** (Range headers through `/fs/`) to the start of M6, **S3** (pdf.js, 200 pages) to the start of M11. They're only needed there.

Done when:
- The app starts on macOS and Hyprland, K1/K2/K12 measured for the first time in `docs/perf-log.md`.
- One Go test and one Vitest Node test run in CI. One Vitest browser test and one Playwright E2E test run locally.
- Results of S1, S4, S5, S6/S7 written down, affected ADRs (0001, 0007, 0008, 0009, 0013) set to accepted or rejected. ADR-0004 and 0005 stay proposed until S2/S3.

## M1 – Open a folder, tree, edit and save a file

- [Own] `workspace`: registry, `Resolve` (jail), `List`, `ReadText`, atomic `WriteText` with mtime conflict check.
- [Glue] Open a folder via CLI argument and native dialog.
- [Own] File tree, virtualized, lazy per folder.
- [Glue] CM6 + Vim + Kanagawa theme, editor basics (line numbers, relative numbers, bracket matching, indentation, in-file search via `@codemirror/search`).
- [Glue] `lang/registry.ts` with highlighting for all target languages, loaded lazily.
- [Own] Buffer store (dirty, mtime).
- [Glue] `:w`, `:e`, `:q` via `Vim.defineEx`.
- [Own] **Vim core list** as tests ([04](04-testing.md#vim-core-list-q20)): shows what codemirror-vim can't do.

Tests: fuzzing `Resolve`, atomic write and conflict, Vim core list in the browser, E2E open/edit/save.

Done when: a real file can be edited with highlighting. An external change leads to an error instead of overwriting. Vim gaps are written down and judged.

## M2 – Commands, keymap, fuzzy finder, splits

- [Own] `core/commands` + `core/keymap` (ADR-0010), every key configurable (Q22). Move the M1 ex commands onto commands.
- [Own] `index` + fuzzy matcher (ADR-0007), file rules from Q26 incl. the setting to show ignored files.
- [Glue] Picker (`<Space>ff`, `Cmd+P` / `Ctrl+Shift+P`), recent files (`<Space>fo`), buffer list (`<Space>fb`), command palette.
- [Glue] Default keymap from my nvim config ([02](02-architecture.md#default-keymap-from-my-nvim-config)).
- [Own] Splits (`:split`, `:vsplit`, `Ctrl-h/j/k/l` and `Ctrl-w h/j/k/l`), buffers independent of panes.
- [Glue] Status line with Vim mode.

Tests: golden rankings, K9/K10 benchmarks, keymap contexts and user overrides, E2E open and split a file by keyboard only.

Done when: every action works by keyboard and shows up in the palette. K9/K10 within budget.

## M3 – File watching

- [Glue] `watch` with fswatcher v2 behind an interface (ADR-0006), self-write filter, overflow → rescan.
- [Own] Frontend reaction: update the tree, reload clean buffers (keep the cursor), dirty buffers → conflict notice.
- [Glue] Incremental index updates.

Tests: Go integration on macOS and Linux, E2E external change.

Done when: `git checkout` in an external terminal shows up correctly, no data loss. K11 within budget.

## M4 – Terminal

- [Glue] `pty` with creack/pty. [Own] Output batching (ADR-0013).
- [Glue] Terminal provider with xterm.js 6, addons fit/web-links/search/unicode, Kanagawa ANSI colors.
- [Own] Bottom panel (`<Space>t`, `Cmd+J` / `Ctrl+Shift+J`) and terminal as a split (`<Space>tc`, `:terminal`) (Q23). `<Space>gg` opens lazygit.
- [Own] Terminal modes (insert/normal, `Ctrl-\ Ctrl-n`) and keymap context `terminal`.
- [Glue] Renderer choice based on S6.

Tests: Go integration with `/bin/sh`, browser tests with a fake stream, E2E `echo $PWD`, manually htop/lazygit/nvim.

Done when: everything that runs in a native terminal runs here, in the panel and in a split. K13/K14 within budget. Closing leaves no processes behind.

## M5 – Markdown live preview, inline

- [Own] `mdlive` part 1: headings, emphasis, inline code, links (markers hidden outside the cursor line), `atomicRanges`.
- [Glue] Links: `gx` → system browser, `gf` on relative `.md` links.
- [Own] Reading view (added 2026-11-09): `<Space>mr` shows Markdown with no raw line at all, not even the cursor line; read-only, status line `READ`.
- [Own] Resizable panes (added 2026-11-09): drag split borders and the panel's top edge; sizes kept per folder. Panel maximize toggle. Vim keys `<C-w>+/-/</>/=`. Reason: the panel at 35 % is too small for btop (needs 24 rows).

Tests: ≥ 30 Node fixtures for the decoration function, browser test of marker visibility with `j/k`. Node tests for layout sizes, E2E drag and `<C-w>=`.

Done when: notes read as if rendered, and Vim motions move cleanly over hidden markers. btop runs in the panel after enlarging it.

## M6 – Markdown live preview, blocks

- First: **Spike S2** (`/fs/` middleware with `http.ServeContent`: do Range headers come through the scheme on macOS and WebKitGTK?). Settles ADR-0005.
- [Own] `mdlive` part 2 (StateField): tables, inline images, code blocks with highlighting (language packages from M1), quotes, task lists.
  - Done 2026-11-09: code blocks, quotes and bullets, task list checkboxes, tables (raw while the cursor is in them), horizontal rules. `fsserve` (Go side, tests incl. Range and fuzz), inline images (relative paths only, via `/fs/`). **Still open:** S2 on WKWebView/WebKitGTK, K3–K5 on real hardware.
- [Own] `fsserve` with jail and workspace ID (ADR-0005).

Tests: `fsserve` with `httptest`, widget browser tests, K3–K5 with `big.md`.

Done when: `big.md` opens and scrolls within budget on both platforms.

## M7 – LSP for Go

- [Own] `internal/lsp`: process management, framing, restart (ADR-0009).
- [Glue] Transport adapter on streams, `@codemirror/lsp-client` for Go with `gopls`.
  - Done 2026-11-09: `internal/lsp` + `lsp` stream, transport, client per (workspace, language) with reconnect/backoff, diagnostics, completion, hover, `gd`, `gr`, rename (F2), format on save, jumps across files inside the workspace (own `Workspace`, several panes per file), `lsp:status` hint when the server is missing, E2E with real gopls. **Still open:** jumps into the Go stdlib/module cache (outside the workspace), manual check in the real app, K16.
- [Glue] Diagnostics, completion, hover, go to definition (`gd`), references (`gr`), rename, format on save (per language, on for Go, Q25).
- [Glue] Status line hint when a server is missing.

Tests: framing unit tests, fake server, browser tests with a fake transport, K16.

Done when: writing Go feels like nvim with gopls.

## M8 – Project search and quickfix

- [Own] `search` in Go with streaming and cancellation (ADR-0016).
- [Own] `core/quickfix` with `:cn`, `:cp`, `:copen`. LSP references from M7 move in here.
- [Glue] Search UI (`<Space>fw`), replace with preview.

Tests: Go table tests and K15 benchmark, E2E search and jump.

Done when: search and replace across the project works by keyboard. K15 within budget.

## M9 – LSP for C/C++, web, Java

One sub-slice each, in this order:
- [Glue] C/C++ with `clangd` (hint about `compile_commands.json`).
- [Glue] Web: `typescript-language-server`, `vscode-langservers-extracted` (HTML/CSS/JSON).
- [Glue] Java with `jdtls` (measure JVM start time and RAM).

Tests: one fake-transport test per language for the mapping, manual tests with real servers.

Done when: all four language groups have diagnostics, completion and navigation.

## M10 – Image viewer

- [Glue] `viewers/image`: fit/100 %, zoom (`+/-/0`), pan (`h/j/k/l`), animated GIFs, SVG only as `<img>`.
- Tests: provider lifecycle, E2E open and zoom.
- Done when: all five formats work, fully keyboard-controlled.

## M11 – PDF viewer

- First: **Spike S3** (pdf.js `PDFViewer` with a 200-page PDF in both WebViews). Settles ADR-0004.
- [Glue] `viewers/pdf` with `PDFViewer`, `PDFFindController`, dynamic import (ADR-0004).
- [Own] Vim-like keymap (`j/k`, `gg/G`, `Ctrl-d/u`, `/`, `n/N`, zoom), page indicator.
- Tests: E2E open and search, K6–K8.
- Done when: a 200-page PDF is within budget, search by keyboard.

## M12 – Separate Markdown preview and optional tabs

- [Own] `viewers/mdpreview`: Lezer tree → DOM, debounced updates from the buffer store.
- [Glue] Command `markdown.togglePreview` (opens in a split).
- [Own] Optional tab bar per pane (setting), `gt/gT`.
- Tests: Node fixtures Lezer → HTML incl. escaping, browser test for updates while typing.
- Done when: the preview matches the live preview, no HTML from the document runs, tabs toggle without restart.

## M13 – Multiple windows and switching folders

- [Glue] New window (`Cmd+Shift+N` / `Ctrl+Shift+N`), switch folder in a window (recent list + dialog) (ADR-0014).
- [Own] Workspace tear-down: buffers, watcher, index, LSP, PTYs. Ask when buffers are unsaved.
- Tests: registry tests (no orphaned processes), E2E two workspaces at once (if the server build allows it).
- Done when: two projects run side by side, switching folders needs no restart, leak #6505 checked.

## M14 – Packaging and hardening

- [Glue] Linux: binary + `.desktop`, then PKGBUILD (Q14). macOS: unsigned `.app`.
- Measure K1–K16 on both machines and close the gaps.
- Done when: install by following the guide takes ≤ 5 minutes, all budgets green or consciously adjusted.

## Later

| | What | Plugs into |
|---|---|---|
| L1 Tasks/build | run commands by key (`go test`, `make`, `pio run`), output in the terminal, errors in quickfix | `pty` + `quickfix` |
| L2 Git | changes in the gutter, status in the tree, diff view | `git` process, CM6 gutter |
| L3 Debugger | DAP, breakpoints, variables (Delve first) | same pattern as LSP |
| L4 Shell integration | `EDITOR=ayaz open` from the terminal (e.g. `sf` in mysh opens a buffer), OSC 7 for the current directory (mysh extension) | `pty` + single instance/CLI |

## Extended – UI polish

The M1 UI is usable but not finished (user feedback 2026-11-08: "much better, still needs work"). Collected here, done when it fits or as its own milestone after M14. Reference: the user's nvim setup (`~/.config/nvim`: snacks, lualine, noice, nvim-web-devicons).

| | What | Notes |
|---|---|---|
| E1 Fonts | font family, size and ligatures as settings | today hard-coded FiraCode Nerd Font, 13 px |
| E2 Icons | bundle "Symbols Nerd Font" as a fallback, more file types and special names | without a Nerd Font installed, icons show as boxes |
| E3 Tree | dim hidden/ignored files, git status colors (L2), indent lines in the tree, filter by typing | like the snacks explorer |
| E4 Status line | git branch, diagnostics, LSP status, encoding, powerline shapes like lualine bubbles | segments come with M7/L2 |
| E5 Cmdline and messages | `:` line and messages as a floating box like noice, notifications that fade out | today codemirror-vim's bottom panel |
| E6 Scrolling and motion | smooth scrolling (like snacks.scroll), animated indent scope | check that 120 fps holds (S1) |
| E7 Welcome screen | dashboard with recent folders and keys, like the snacks dashboard | today one button |
| E8 Window | inset title bar on macOS, window title with folder and file | |
| E9 Theme | follow the desktop theme like the nvim colorscheme (caelestia), more themes than Kanagawa | tokens are already CSS variables |
| E10 Details | scrollbar style, cursor line edge, spacing between tree and editor, hover states | small fixes from daily use |

---

## What I write myself, and why

| Module | Why it's worth writing |
|---|---|
| `workspace` (jail, atomic write, registry) | security, data loss, learn fuzzing |
| Fuzzy matcher + index | algorithm, benchmarks |
| Command registry + keymap | the core of the controls, small and pure |
| Splits/buffer model + bottom panel | tree data structure, easy to test |
| PTY output batching | concurrency, latency vs. throughput |
| LSP framing + process management | protocol, processes, concurrency |
| Project search + quickfix | worker pool, streaming, cancellation |
| `mdlive` | CM6 decorations, pure functions |
| Lezer → DOM (separate preview) | tree traversal, escaping |
| Virtualized file tree | DOM performance |
| Custom Vim motions | well-scoped via `defineMotion` |

Everything else (Wails setup, CM6/Vim/language config, xterm.js, LSP clients, pdf.js, image viewer, fswatcher adapter, `fsserve` wrapper, packaging) is glue.
