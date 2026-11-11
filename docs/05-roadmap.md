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
  - Done 2026-11-09: `internal/lsp` + `lsp` stream, transport, client per (workspace, language) with reconnect/backoff, diagnostics, completion, hover, `gd`, `gr`, rename (F2), format on save, jumps across files inside the workspace (own `Workspace`, several panes per file), `lsp:status` hint when the server is missing, E2E with real gopls, read-only jumps into the Go stdlib and module cache (Go reads only below `go env GOROOT GOMODCACHE`), K16 (~1.4 ms p95 at 200 KB, perf-log). **Still open:** manual check in the real app.
- [Glue] Diagnostics, completion, hover, go to definition (`gd`), references (`gr`), rename, format on save (per language, on for Go, Q25).
- [Glue] Status line hint when a server is missing.

Tests: framing unit tests, fake server, browser tests with a fake transport, K16.

Done when: writing Go feels like nvim with gopls.

## M8 – Project search and quickfix

- [Own] `search` in Go with streaming and cancellation (ADR-0016).
- [Own] `core/quickfix` with `:cn`, `:cp`, `:copen`. LSP references from M7 move in here.
- [Glue] Search UI (`<Space>fw`), replace with preview.
  - Done 2026-11-09: `internal/search` (worker pool, smart case, literal or RE2, skips binary and > 2 MB, stops at 10,000 hits), `search` stream (batches every 30 ms, closing it cancels), picker with `<C-q>` to quickfix, `:cn`/`:cp`/`]q`/`[q`/`:copen`, `:Replace text` with a preview picker (clean buffers are saved, dirty ones stay unsaved, moved matches are skipped), `gr` fills quickfix. After a regex search `:Replace` expands `$1`…`$9`, `$0` and `$$` (Go sends each hit's groups, so RE2 decides them); after a literal search the text stays literal. Shortcut: `:copen` is a picker, not a window.

Tests: Go table tests and K15 benchmark, E2E search and jump.

Done when: search and replace across the project works by keyboard. K15 within budget.

## M9 – LSP for C/C++, web, Java

One sub-slice each, in this order:
- [Glue] C/C++ with `clangd` (hint about `compile_commands.json`).
- [Glue] Web: `typescript-language-server`, `vscode-langservers-extracted` (HTML/CSS/JSON).
- [Glue] Java with `jdtls` (measure JVM start time and RAM).

  - Done 2026-11-09: one server table (`serverFor` in `editor/lsp.ts` → command in `app/lsp.go`), one server per (workspace, server), so `.c`/`.cpp` share clangd and `.ts`/`.js` share one TypeScript server. clangd hint when no `compile_commands.json`/`compile_flags.txt` is in the root or `build/`, read-only jumps into system headers, E2E with real clangd. jdtls gets a data folder per project under the user cache. Format on save stays Go only (Q25). **Still open (servers not installed here):** manual tests with `typescript-language-server`, `vscode-langservers-extracted` and `jdtls`, JVM start time and RAM; jumps into TypeScript's `lib.d.ts` and jdtls' `jdt://` class files aren't shown.

Tests: one fake-transport test per language for the mapping, manual tests with real servers.

Done when: all four language groups have diagnostics, completion and navigation.

## M10 – Image viewer

- [Glue] `viewers/image`: fit/100 %, zoom (`+/-/0`), pan (`h/j/k/l`), animated GIFs, SVG only as `<img>`.
- Tests: provider lifecycle, E2E open and zoom.
- Done when: all five formats work, fully keyboard-controlled.
- Done 2026-11-09: `core/viewers.ts` (small provider registry, ADR-0011) and `viewers/image.ts`: fit, `+`/`=`/`-` zoom around the center, `0` fit, `1` 100 %, `h/j/k/l` pan, zoom and size in the status line, reload on change on disk. A split of an image pane shows the image too; opening a text file turns the pane back into an editor. `/fs/` now sends `Content-Security-Policy: sandbox …` so an SVG or HTML opened by URL can't run scripts. Shortcut: the editor and terminal aren't providers yet, `Editors` handles them directly.

## M11 – PDF viewer

- First: **Spike S3** (pdf.js `PDFViewer` with a 200-page PDF in both WebViews). Settles ADR-0004.
- [Glue] `viewers/pdf` with `PDFViewer`, `PDFFindController`, dynamic import (ADR-0004).
- [Own] Vim-like keymap (`j/k`, `gg/G`, `Ctrl-d/u`, `/`, `n/N`, zoom), page indicator.
- Tests: E2E open and search, K6–K8.
- Done when: a 200-page PDF is within budget, search by keyboard.
- Done 2026-11-09: `viewers/pdf.ts` on `PDFViewer` + `PDFFindController` (pdfjs-dist 6.4.299 pinned, loaded on the first PDF, worker as its own asset), page width by default, `j/k`, `<C-d>/<C-u>`, `gg/G`, `J/K` pages, `+/-/0/1` zoom, `/` `n` `N` search with the match count and page in the status line, links only through the system browser, no PDF scripting, no XFA, a PDF changed on disk reloads on the same page and zoom. `scripts/gen-bigpdf.mjs` makes the 200-page test file. S3 in headless WebKit only: K6 95 ms, K7 254 ms (perf-log). K8 in the app (perf-log): +448 MB with pdf.js defaults, +223 MB with `maxCanvasPixels` at pdf.js' phone value (now on); pages render in a worker (S8) and the sharp detail canvas follows when scrolling stops, so scrolling while pages render runs at p50 8 ms, p95 10 ms, max 17–19 ms per frame (perf-log). **Still open:** S3 in WKWebView and WebKitGTK, Range requests through the Wails scheme in the native app (S2), frame times on Hyprland, hand check with a real paper (fonts, images) and trackpad.

## M12 – Separate Markdown preview and optional tabs

- [Own] `viewers/mdpreview`: Lezer tree → DOM, debounced updates from the buffer store.
- [Glue] Command `markdown.togglePreview` (opens in a split).
- [Own] Optional tab bar per pane (setting), `gt/gT`.
- Tests: Node fixtures Lezer → HTML incl. escaping, browser test for updates while typing.
- Done when: the preview matches the live preview, no HTML from the document runs, tabs toggle without restart.
- Done 2026-11-09, differently than planned: the preview (`<Space>mp`) is a second pane on the same buffer in the reading view, not a second renderer from the Lezer tree. It matches the live preview because it is the same code, follows typing through the existing pane sync, and raw HTML stays text (cells and widgets use `textContent`). `<Space>mp` again closes it. Tab bar per pane (palette "Toggle tab bar", kept in `localStorage`), `gt`/`gT`, click, `<Space>bd` drops a tab (the buffer stays loaded), `[+]` on tabs with unsaved changes. Source and preview keep the same line at the top, both ways; the active pane leads, so the scroll doesn't echo.

## M13 – Multiple windows and switching folders

- [Glue] New window (`Cmd+Shift+N` / `Ctrl+Shift+N`), switch folder in a window (recent list + dialog) (ADR-0014).
- [Own] Workspace tear-down: buffers, watcher, index, LSP, PTYs. Ask when buffers are unsaved.
- Tests: registry tests (no orphaned processes), E2E two workspaces at once (if the server build allows it).
- Done when: two projects run side by side, switching folders needs no restart, leak #6505 checked.
- Done 2026-11-09: `Close(ws)` stops the watcher, drops the indexes, hangs up the workspace's shells and servers and forgets the ID (Go test: nothing of the closed workspace keeps running, the other one does). Bindings take Wails' `ctx`, so a workspace belongs to its window: the close button asks the frontend first (`app:close-request`; unsaved buffers block it like `:qa`), a close that goes through tears the workspace down. `:qa` now closes the window, the app quits after the last one. New window (`Cmd+Shift+N` / `Ctrl+Shift+N`) starts on the welcome screen with recent folders; `<Space>fp` switches folder (recent list or dialog), refused while buffers are unsaved; the frontend also stops that workspace's LSP clients. E2E: two pages side by side, switch, `/fs/` of the old ID gives 404. **Still open:** #6505 on Hyprland (closed windows leaving WebKitWebProcess behind), native window checks by hand (close button with unsaved buffers, `Cmd+Q`).

## M14 – Packaging and hardening

- [Glue] Linux: binary + `.desktop`, then PKGBUILD (Q14). macOS: unsigned `.app`.
- Measure K1–K16 on both machines and close the gaps.
- Done when: install by following the guide takes ≤ 5 minutes, all budgets green or consciously adjusted.
- Done 2026-11-09 on macOS: install guide in the README, `task darwin:package` gives an ad-hoc signed `bin/ayaz.app`, `build/linux/ayaz.desktop` and `build/linux/arch/PKGBUILD` (`ayaz-git`, gtk4 + webkitgtk-6.0). macOS budgets measured (perf-log): K1 398 ms, K2 111 MB, K12 13 MB, K6/K7/K15/K16 green. **Still open:** the PKGBUILD and all K numbers on Hyprland, the 5-minute install check by hand, a LICENSE (the PKGBUILD says unknown).

## M15 – File operations in the tree

- [Own] `workspace`: create, rename, trash; symlinks are renamed or trashed as links, never their target, the root never.
- [Glue] Tree keys like nvim-tree: `a` new (`/` at the end makes a folder), `r` rename/move, `d` trash, `y`/`Y` copy path, `s` reveal in Finder.
- Done 2026-11-10: `Create`/`Rename`/`Trash`/`Reveal` in `WorkspaceService`, Go tests for the jail. Trash moves into `~/.Trash` on macOS (no "Put Back") and uses `gio trash` on Linux. Name input and confirmation use the picker. Open buffers follow a rename (tabs, recent files) or close on trash; unsaved buffers block both. All of it also works from the palette on the active file, plus "Show current file in tree". The tree cursor now stays on its file when rows come and go (a save's temp file used to move it). E2E `tree.spec.ts`. **Still open:** the trash itself by hand in the app (e2e would fill the real trash), `gio trash` on Hyprland.

## M16 – Session per folder

- [Own] `shell/session.ts`: splits, the file and tabs per pane, the active pane and the cursor of the last 200 files, per folder in `localStorage`.
- Done 2026-11-10: saved at most every 500 ms (a throttle, not a debounce: a build writing files would push a debounce back forever), and at once on `:qa`, the close button and switching folders. Opening the folder restores it; terminals come back as empty editors, a preview as a normal editor, files that are gone are skipped. Without files in the session it starts in the tree as before. A broken entry starts fresh (Node tests), E2E `session.spec.ts` reloads the page. **Still open:** `Cmd+Q` quits without asking the frontend, so up to 500 ms of changes can be lost.

## M17 – Zoom

- Done 2026-11-10: `Cmd +`/`Cmd =`, `Cmd -`, `Cmd 0` (Linux `Ctrl`) zoom the whole page through Wails' `Window.SetZoom`, 50–200 % in 10 % steps, kept in `localStorage` for every window and set again at start. The status line shows the level. **Still open:** check in the app that xterm, the PDF canvases and dragging split borders stay right when zoomed; Hyprland.

## M18 – Reopen closed tabs, back and forward across files

- Done 2026-11-10: `Cmd+Shift+T` (Linux `Ctrl+Shift+T`) reopens the tab closed last, also the tabs of a closed pane (up to 50). Back/forward per pane across files with the cursor, like a browser: `Cmd+[`/`Cmd+]` and `Ctrl -`/`Ctrl Shift -` on macOS (brackets need Alt on German layouts), `Alt+←`/`Alt+→` on Linux. Every file switch counts (tree, picker, `gd`, quickfix, tabs), a rename does not. Vim's `<C-o>`/`<C-i>` inside a file stay. Node test for the stacks, E2E `nav.spec.ts`.

## M19 – Git in the gutter, branch in the status line (L2, first part)

- Done 2026-11-10: `internal/git` asks the `git` program for the branch (short SHA when detached) and a file's text at HEAD (`HEAD:./path`, so a folder inside a repo works). The watcher skips `.git/`, so Go polls `HEAD`, `index` and `logs/HEAD` once a second and sends `git:changed`; that catches commits from lazygit. The gutter right of the line numbers diffs the buffer against HEAD with `@codemirror/merge`'s `Chunk` (updated per keystroke, no full rediff): green bar added, blue changed, red triangle deleted. `]c`/`[c` jump between hunks (wrapping), `<Space>hp` previews, `<Space>hr` resets (undo works). The status line shows the branch. Node test for the sign mapping, browser test for gutter and keys, Go tests with a temp repo, E2E `git.spec.ts` (the e2e copy now sits in a repo one level up). **Still open:** in the app, a commit and `git checkout` from lazygit; diff view and tree colors (rest of L2).

## M20 – Symbols

- Done 2026-11-10: `<Space>fs` lists the file's symbols (`textDocument/documentSymbol`, hierarchical or flat, children named after their parent), ranked by name with the Go matcher. `<Space>fS` asks the server on every keystroke (`workspace/symbol`); the picker drops stale answers, results outside the folder (stdlib) open read-only like `gd`. Codicon glyphs per `SymbolKind`. Without a server: "No language server for this file". Browser test with a fake server, E2E with gopls. **Still open:** latency of `<Space>fS` in a big Go project; containers for gopls need the client to announce hierarchical symbols.

## M21 – Diagnostics as a list and in the status line

- Done 2026-11-10: a `publishDiagnostics` handler in `clientFor` keeps every file's diagnostics per folder (also files that aren't open: gopls reports whole packages) and returns false, so lsp-client still underlines. `<Space>fd` (or a click on `E n W n` in the status line) fills the quickfix list, errors first. `]d`/`[d` jump within the file and land on the start in normal mode, like nvim. Node test for the store, browser test that the handler keeps the underline, E2E with `broken.go`. **Still open:** the counts with clangd/ts in the app.

## M22 – Cleanup on save, line wrap

- Done 2026-11-10: `:w` trims spaces and tabs at line ends and leaves exactly one final newline, as one undoable change after the formatter, for every language except read-only buffers. Markdown keeps two or more trailing spaces (hard break). Empty and blank files stay as they are. `<Space>uw` toggles line wrap in every pane, kept in `localStorage`; the default is off, on for Markdown. `j`/`k` move by logical lines, `gj`/`gk` by screen lines. Node fixtures for the cleanup, browser test for wrap and `gj`/`gk`, E2E `:w` then `u`. **Still open:** `gk` from the very start of a wrapped row stays put (codemirror-vim takes it as the end of the row above); wrap with the Markdown live view in the app.

## M23 – Cmd+Q asks first

- Done 2026-11-10: Wails' `ShouldQuit` hook sends every window with a folder the same `app:close-request` as its close button (unsaved buffers stop it, the session is saved), closes the others, and quits only once no window is left. Fixes the M16 note that `Cmd+Q` could lose the last 500 ms of session. **Still open:** native check by hand (no window in the server build).

## M24 – Comments, closing brackets, surround

- Done 2026-11-10: `gcc`, `gc{motion}` and `gc` in visual mode comment lines (codemirror-vim's operator over CM6's `toggleLineComment`, so the language's comment tokens). Brackets and quotes close themselves, backspace removes the pair (`closeBrackets`). Surround like nvim-surround: `ys{motion}{char}`, `yss{char}`, `ds{char}`, `cs{old}{new}`, `S{char}` in visual mode; an opening bracket puts spaces inside, a closing one doesn't, `b`/`B` are `(`/`{`. Since `d`, `c` and `y` are complete operators in codemirror-vim, `s` is an operator-pending map that cancels the operator and reads the chars itself. Browser tests in the Vim core list. **Still open:** `.` doesn't repeat a surround; no tags (`ysiwt`).

## M25 – LSP keys

- Done 2026-11-10: `K` shows the server's hover text as a tooltip at the cursor (gone on the next move, edit or Esc). `<Space>cr` asks for the new name in the picker and applies the rename to every file, also files that aren't open; like `:Replace`, clean buffers are saved, dirty ones stay unsaved. `<Space>ca` lists code actions (with the diagnostics on the selected lines, so quick fixes come too) and runs the picked one: its edit, its command, or both. Commands may send edits back through `workspace/applyEdit`, which lsp-client doesn't answer, so the transport does. `gI` and `gy` jump to the implementation and the type. Without a server the status line says why: no server for the file type, the server is still starting, or it isn't installed plus how to install it (also in the "not found in PATH" message). Node tests for the edit conversion and `applyEdit`, E2E with gopls (hover, rename across `src/greet.go` and `src/main.go`, the action list). **Still open:** file operations in edits (create, rename, delete) are skipped; `codeAction/resolve` isn't announced, so servers send edits up front.

## M26 – settings.json

- Done 2026-11-10: `settings.json` next to `keymap.json` (`ConfigService.Settings`), read before the first editor: `font`, `fontSize` (editor and terminal), `tabWidth`, `tabs`, `wrap`, `formatOnSave`, and `languages` keyed by file extension with the same file keys on top. The defaults keep the old behavior (Go: tabs and format on save, Markdown: wrap) except the indent, now 4 spaces instead of CM6's 2. Unknown keys and wrong types are named in the status line, the defaults stay. Font size through `--editor-font-size`, line height size + 11 px (24 px at 13). Documented in 02-architecture. Node tests for parsing and merging. **Still open:** changes need a restart, like the keymap; the font in the app by hand.

## M27 – Bundled symbols font

- Done 2026-11-10: the Nerd Fonts "Symbols Only" font (v3.4.0, Mono, MIT, `theme/fonts/`) as woff2 (1.2 MB), last in `--font-mono`, so tree, tabs and shell prompts show icons without an installed Nerd Font; an installed one still wins. The face only covers the private use areas and the few extra symbols, so it never replaces a letter. It is added through `FontFace` and loaded before the first frame (a CSS `@font-face` wasn't known to WebKit yet at start), so xterm's WebGL atlas doesn't keep boxes. E2E checks it is loaded. **Still open:** a look in the app without any Nerd Font installed (Linux VM).

## M28 – Welcome page with keys

- Done 2026-11-10: the page of a window without a folder (recent folders with `1`–`9`, "Open folder…") now also lists the keys to know first: find files, search, all commands, tree, terminal, splits, `gd`/`gr`/`K`, rename and code actions, `:w`/`:q`. The keys come from the default keymap, so they stay right when defaults change; the user's `keymap.json` isn't read yet on that page. The card scrolls when the window is short. E2E in `windows.spec.ts`. **Still open:** keys in Vim notation (`<D-p>`), not as `⌘P`.

## M29 – Git status in the tree (L2, second part)

- Done 2026-11-10: `git.Status` runs `git status --porcelain=v1 -z --ignored=matching` for the folder (paths made relative to it when it is a subfolder of the repo). The tree colors names: changed blue, new and untracked green, conflicts red, ignored rows at 45 % opacity; a folder takes the strongest state below it, files inside an untracked or ignored folder take that folder's. Asked again after every change on disk and on `git:changed` (Go's poll), so a commit from lazygit clears the colors. Go test with a temp repo (staged, deleted, ignored folder and file, subfolder as workspace), Node test for the roll-up, E2E new → commit → changed. **Still open:** a big repo (status on every save); no letters (M/U) next to the names, colors only.

## M30 – Diff against HEAD (L2, last part)

- Done 2026-11-10: `<Space>gd` toggles `@codemirror/merge`'s unified view in the editor, against the HEAD text the gutter already has: the HEAD version of each changed block shows above it, red, read-only; the buffer stays editable and Vim works as usual. A new HEAD (commit, checkout) swaps the compared text in an open diff, a file that left HEAD closes it. Without a HEAD version the status line says so. Browser test (on, new HEAD, off), E2E edit → `<Space>gd` → off. **Still open:** no side-by-side view like `:Gvdiffsplit`; a diff against the index or another commit.

## M31 – Filter the tree

- Done 2026-11-10: `/` in the tree opens a filter box above it. The text goes through the same fuzzy file search as `<Space>ff` (whole project, not only loaded folders, up to 200 files), and the matches show as a tree with their folders open. Enter or ↓ goes to the rows (cursor on the first file), Enter there opens; Esc in the box or in the tree ends the filter, `/` again edits it. Node test for the rows, E2E. **Still open:** results come async, so an Enter typed faster than the search lands on nothing; folders themselves aren't matched.

## M49 – Hot exit

- Done 2026-11-10: every 2 s, each dirty buffer whose text changed since the last write goes to a swap in the user cache (`~/Library/Caches/ayaz/swap/<folder hash>/`, `AYAZ_CACHE_DIR` overrides), never into the project; written through a temp file. A buffer that is clean again (`:w`, undo, `:e!`) or no longer loaded (renamed, trashed) loses its swap, `:q!`/`:qa!` drop all of them. When the folder opens, each swap whose text differs from disk gets a picker: Restore (as unsaved changes, not written) or Discard; Esc keeps it for next time, swaps equal to disk go silently. Go test for write/read/remove and broken files, Node test for the sync, E2E: type in two files, reload, restore one, discard the other, `:w`, reload asks nothing (runs alone, after `config.spec`). **Still open:** two windows on the same folder see each other's swaps; up to 2 s of typing can be lost.

## M50 – Local history

- Done 2026-11-10: every save keeps the text it replaced, in the user cache next to the swaps (`history/<folder hash>/<file hash>/<ms>.txt`), up to 30 per file, none for files over 1 MB or saves that change nothing; Go does it inside `WriteText`, so nothing extra crosses the bridge. `<Space>fh` lists them (time, age, size), Enter shows the buffer against that text in `<Space>gd`'s unified view; that diff stays when HEAD moves, `<Space>gd` closes it. Go test (pruning, newest first, unchanged and big files), browser test (diff stays on a new HEAD), E2E two saves → pick the older one. **Still open:** history follows the path, not renames; no "restore this version" key (copy from the diff, or `u`).

## M51 – Big files and repositories measured

- Done 2026-11-10: numbers in `docs/perf-log.md` (browser test `large.browser.test.ts`, `scripts/bigrepo.sh` + `TestBigRepo` on Go's source tree, 12k files). Long lines are what costs: from ~32 KB one line costs 15–25 ms per key with highlighting, so a file with a line over 20,000 characters opens as plain text (2 ms). A 10 MB Go file types at 3 ms, the repo needs no limit (index 45–62 ms, find 0.4 ms, search 150 ms, `git status` 65 ms). The browser test gates both cases under 8 ms per key. **Still open:** no notice in the status line that highlighting is off; 50 MB files scroll with dropped frames; Wails' bridge cost for a 10 MB `ReadText` not measured in the app; no repo with 100k+ files tried.

## M52 – Tasks

- Done 2026-11-10: `tasks` in `settings.json` (name → command); `<Space>rr` picks one, `<Space>rl` runs the last again. A task runs in a terminal split that stays after it ends; its output goes through a parser (`file:line:col: text`, Go, gcc, tsc) into the quickfix list. Node test for the parser, E2E with `go vet` on `broken.go`. **Still open:** no task output while the task runs (the list fills at exit); no `${file}` placeholders.

## M53 – Shell integration

- Done 2026-11-10: `ayaz file[:line[:col]]` from a terminal hands the file to the running app over a Unix socket (`<user cache>/ayaz/ayaz.sock`) and exits; the window whose folder holds the file shows it (deepest folder wins), otherwise a new window opens on the file's repository (else its folder). Without a running app the command starts one on that project. `--wait` (`-w`) keeps the call open until no pane shows the file any more (`:q`, `:wq`, another file in its place) or its window closes, so `EDITOR="ayaz --wait"` works for `git commit`. Terminals read OSC 7; a new terminal split starts in the folder the focused terminal reported. Go tests (argument parsing, socket round trip incl. wait, stale socket, start folder), Node tests (wait registry, OSC 7). **Still open:** not tried in the real app (window handling, `git commit` with `--wait`); zsh and bash don't send OSC 7 by themselves (a `precmd` hook printing `\e]7;file://$HOST$PWD\a`, mysh could do it natively); with `--wait` and no running app, the call lasts as long as the app; no `ayaz` on PATH yet (symlink `Contents/MacOS/ayaz`).

## M54 – Semantic tokens

- Done 2026-11-10: `textDocument/semanticTokens/full` and `full/delta` (`editor/semantic.ts`, decoder and delta merge in `semantic-tokens.ts`); the token type becomes a `cm-sem-*` class that the Kanagawa theme colours over the Lezer highlighting (namespace, type, class, struct, interface, enum, type parameter → type colour; function, method → function; parameter; enum member and `readonly` → constant; macro, decorator; `deprecated` struck through). Variables, strings, numbers and keywords stay with the grammar. `"semanticTokens": false` in `settings.json` turns it off (default on); gopls gets `semanticTokens: true`. `lsp-client` has no semantic tokens, so the client asks itself (like inlay hints). Node tests (decode, delta, class names), browser tests (colour beats the syntax colour; a change asks for a delta with the old result ID; 19,000 lines with 38,000 tokens type at p95 4 ms), E2E with gopls (`fmt` namespace, `Println` function). **Still open:** documents over 400 KB get none (no range requests); only checked with gopls, not clangd, TypeScript, jdtls; no `workspace/semanticTokens/refresh`; modifiers beyond `readonly`, `defaultLibrary`, `deprecated` aren't coloured.

## M55 – Structural text objects

- Done 2026-11-10: from the Lezer tree (`editor/vim/structure.ts`, keys in `structural.ts`): `af`/`if` (function; inner is the lines inside the braces, or an arrow function's expression), `ac`/`ic` (class, struct, interface, enum, Go `type`), `aa`/`ia` (argument or parameter; outer takes the comma after it, the last one the comma before), a count goes outwards (`2af`); `]f`/`[f` jump to the next or previous function start (also inside functions). `+` grows the selection one step (from normal mode it starts on the node under the cursor), `-` in visual mode takes a step back; the steps come from `textDocument/selectionRange` when the server offers it (gopls), else from the syntax tree. Node names for Go, JS/TS, C/C++ and Java. Node tests for every grammar, 12 browser tests in the Vim list, E2E with gopls (`++d` takes `fmt.Println` out). **Still open:** no `]c`/`[c` (class) and no `]a`; `d]f` has the old exclusive-linewise gap (leaves an empty line); other grammars (JSON, HTML, CSS, Markdown) have no objects; `+` and `-` replace Vim's own line motions in the editor (`-` only in visual mode).

## M56 – Document highlight

- Done 2026-11-10: `textDocument/documentHighlight` (`editor/highlight.ts`): once the cursor has rested for 350 ms with nothing selected, the other occurrences of the symbol under it get a soft background (writes in the constant colour); moving or typing clears them at once, nothing is asked per key, a symbol that occurs once gets no mark. Servers without `documentHighlightProvider` are left alone. Browser test with a fake server (marks after the rest, write kind, clears on a move, one request for a burst of moves and edits). **Still open:** not tried against gopls, clangd or TypeScript in the app; no setting to turn it off; no `]]`/`[[` jumps between occurrences.

## M57 – Sticky scroll

- Done 2026-11-10: the functions, methods and classes whose first line has scrolled out of view stay on top of the editor as a panel (outermost first, at most 3 rows, signature without the opening brace); a click jumps to the definition. `"stickyScroll": false` in `settings.json` turns it off. Node tests (scopes around a position, anonymous functions left out, header text), browser tests (shows, follows into the next function, vanishes at the top, click jumps). **Ruling:** the scopes come from the Lezer tree, not from `textDocument/documentSymbol` as the plan said: the tree answers synchronously on every scroll frame, a server round trip per scroll could not, and for the four grammars with node tables the names are the same. **Still open:** grammars without a table (JSON, HTML, CSS, Markdown) get no rows; no breadcrumb path in the status line; rows aren't cut to the pane width on very long signatures except by ellipsis.

## M58 – Call hierarchy

- Done 2026-11-10: `<Space>ci` fills the quickfix list with the call sites of the function's callers (`callHierarchy/incomingCalls`), `<Space>co` with the definitions of the functions it calls (`outgoingCalls`), both in the command picker too. A server without `callHierarchyProvider` says so; no result says "No incoming calls". The server's errors now show their message in the status line (they arrive as `{code, message}` objects and showed as "[object Object]"). Browser tests with a fake server (both directions, no provider), E2E with gopls (`hello` calls `fmt.Println` in the standard library; nobody calls `hello`). **Ruling:** the plan's M62 also names `<Space>co` (ours); M62 will take `<Space>m`-keys for conflicts instead. **Still open:** only the first item of `prepareCallHierarchy` is used; no tree view of deeper levels (run it again from a quickfix entry); outgoing lists each callee once, not each call site.

## M59 – Completion: extra edits, snippets

- Done 2026-11-10: `lsp-client` already turns `insertTextFormat: 2` into CodeMirror snippets ($1, ${1:name}, Tab between stops), but drops `additionalTextEdits` and never resolves an item, so completion has its own source now (`editor/completion.ts`, the same request and ranges): the extra edits go in first (the import goes with `fmt.Println` typed before `import "fmt"`), then the text, mapped through them; items without edits are resolved through `completionItem/resolve` when the server offers it, and the client says it can. `snippets.json` in the config folder (written explained next to `settings.json`, hot reloaded, parse errors in the status line): VS Code's shape keyed by extension (`"go"`, `"*"`), `prefix` as text or list, `body` as text or lines, `$1`/`${1:x}`/`$0`; the snippets show in the completion list of that kind of file above the server's. Go tests (config files, watcher), Node tests (parser), browser tests (import with the item, with a resolve, with a snippet, snippets.json inserting and unloading), E2E with gopls (`fmt.Printl` + Enter → `Println()` and the import). **Still open:** VS Code variables (`$TM_FILENAME`, `$CLIPBOARD`) and `${1|a,b|}` choices aren't expanded; the pick is two undo steps when extra edits come along; a slow resolve drops the extra edits if you typed meanwhile; one E2E run in the full suite stopped after 39 tests (5 did not run), the next run passed all 51: not found why.

## M60 – Inline blame

- Done 2026-11-10: `<Space>gb` shows author, age, short commit and message of the cursor line at its end (`git blame --porcelain -L n,n`, in Go: `git.LineBlame`); it goes when the cursor or the text moves. A buffer with unsaved changes is blamed as it is (`--contents -`), so an edited line says "Not committed yet" and the other lines keep their commit. Go test (real repository: author, summary, unsaved text, subfolder, untracked file, no repository), Node test (relative age, text), browser test (widget at the line end, cleared by a move or an edit), E2E (a committed line, then an edited one). **Still open:** one line at a time, no always-on blame while moving; no jump from the blame to the commit (`:Git show`); library files (outside the folder) have none; the age is relative only, no date on hover.

## M61 – Stage hunks

- Done 2026-11-10: `<Space>hs` stages the hunk under the cursor, `<Space>hu` takes a staged one out of the index again; the working file isn't touched. Go builds the patch's header and runs `git apply --cached --unidiff-zero` (`--reverse` for unstaging) from the folder, so a folder inside a repository works (`--show-prefix`); the hunk comes from the buffer's own text, saved or not. The gutter reads HEAD and the index: a change that is already staged is drawn at 40 % (`cm-git-staged`), what `<Space>hs` can still stage keeps the colour; the hunk to unstage is found through the buffer-to-index mapping, so lines added above don't confuse it. Go test (stage a change, an insertion, a deletion, unstage, a hunk that doesn't fit, subfolder), Node tests (hunk text for change, insertion, deletion, top of file, no final newline), browser test (dim marks, which hunk is found where, after an insert above), E2E (stage one of two hunks, check `git diff --cached`, unstage, stage the other). **Still open:** one hunk at a time (no stage-visual-selection, no `:Gwrite` for the whole file); a new untracked file has no gutter, so nothing to stage; staging while the buffer has other unsaved edits stages only the hunk, and the file on disk differs until saved; the `]c` jumps still use all changes (staged ones too).

## M62 – Merge conflicts

- Done 2026-11-10: complete conflict blocks (`<<<<<<<`, optional `|||||||` base from diff3 style, `=======`, `>>>>>>>`) are found in every editor and coloured (ours green, theirs blue, base grey, marker lines stronger); `<Space>mo`, `<Space>mt` and `<Space>mb` replace the block under the cursor with ours, theirs or both (one undo step), `]x`/`[x` jump between conflicts and wrap. Half blocks, a Markdown `=======` underline and longer rows of equals are not conflicts; files over 2 MB aren't scanned; with no conflict in the file only an edit that inserts marker-like text triggers a scan. Node tests (blocks, diff3, non-conflicts, the three picks with empty sides), browser tests (colours, typing a marker, resolving, jumps), E2E (two blocks: jump, take theirs, take ours). **Ruling:** the plan's `<Space>co/ct/cb` collide with `<Space>co` (outgoing calls, M58), so the keys are `<Space>mo/mt/mb`. **Ruling:** the side-by-side diff (`:Gvdiffsplit`-like) is not built: it needs the three versions from the index (`git show :1:`, `:2:`, `:3:`) in extra panes and a merge view, a piece of its own; the blocks plus the unified diff cover resolving. **Still open:** the tree doesn't mark files with conflicts beyond what `git status` letters give; no "all resolved, stage it" prompt (`git add` is `<Space>hs` per hunk or lazygit); `]x` doesn't cross files.

## M63 – Vim fidelity

- Done 2026-11-10: about 90 daily nvim commands as browser tests (`describe("daily nvim commands")` in `core.browser.test.ts`): `:g`/`:v` with `d`, `s` and `normal`, `:normal` over ranges, `:s` and `:d` with ranges (`:2,3`, `:.,+1`), `:m`, `:t`, `:>`/`:<`, macros with counts and over lines (`:2,4normal @a`), named, append, black-hole and numbered registers, `gv`, block `I`/`A`/`c`, visual `>`/`J`/`.`, `*`/`#`/`g*`, `ciw`/`ca[`/`d2aw`/`dis`, `<C-a>`/`<C-x>` with counts, case operators, `Y`/`P`/`J`/`gJ`. 75 of them already worked. **Built** (`editor/vim/ex.ts`): `:m{addr}`, `:t{addr}`/`:co`, `:>`/`:<` with ranges (the address is a number, `.`, `$`, `+N`, `-N`; `:m0`, `:t0` work for one-digit numbers: the library reads the command name as `\w+`, so each `m0`…`m9` is registered; `:m 12` with a space works for any). **Known gaps, kept honest with `test.fails`:** `:s` takes JavaScript patterns and replacements (`(a)(b)` and `$2$1`, not vim's `\(a\)\(b\)` and `\2\1`); `mA`…`mZ` are per editor, so `'A` from another file finds nothing (E2E `test.fail`); `"+y`/`"+p` go through `navigator.clipboard`, which headless WebKit denies, so they are a manual check (the system clipboard is used by the real app); `d}` and `dG` edge cases from M25 are unchanged. **Still open:** magic-pattern translation for `:s` and `:g`; global marks across files; `:sort`, `:retab`, `:read` and `:!` weren't looked at.

## M64 – Release readiness

- Done 2026-11-10: CI (`.github/workflows/ci.yml`) runs the browser tests and the E2E on macOS as well as Linux, with a real gopls (`v0.24.0`) so the LSP tests don't skip; the Go job already ran on both with `-race`. `docs/07-manual-checks.md` lists what no test reaches (the macOS app, the Hyprland machine) per milestone, with a release checklist. **Not done, needs the author:** the `LICENSE` (none is in the repository; the choice is theirs), the manual checks themselves, the Hyprland runs, and the push (`origin` is far behind, pushing waits for a go). The workflow wasn't run on GitHub from here: only its YAML was parsed and its commands match what runs locally.

## M65 – UX pass

- Done 2026-11-11 (unattended session, report in `docs/plans/2026-11-11-ux-report.md`): picker preview pane with the editor's colors (files, recent, buffers, search hits, symbols, quickfix), `name:line` in Find files, Cmd/Ctrl+Enter opens to the side, recent files first, folder dim with the file name kept whole, theme picker previews live; named which-key groups; tab names stay whole, middle and right click on tabs; right click menu and header buttons in the tree, draggable sidebar; `[3/12]` search count, selection size and word count in the status line; diagnostic text after the line (`<Space>ud`); color swatches; errors fade; recent files on the empty window. Fixes a picker that kept its instance (and lost the focus) when a pick opened another picker. Go: `WorkspaceService.Preview` (first bytes of a file).

## M66 – More languages, Typst and LaTeX

- Done 2026-11-11: Python, Rust, YAML, TOML, shell, SQL, XML, PHP, Lua, Dockerfile (found by name), Typst (own `StreamLanguage`, `lang/typst.ts`) and LaTeX (`stex`) are highlighted; servers pyright, rust-analyzer, yaml-language-server, taplo, tinymist and texlab sit in `lang/registry.ts`, `app/lsp.go` and the install hints in `editor/lsp.ts`. `<Space>mp` on `.typ`/`.tex` runs `typst watch` (or a tectonic loop that rebuilds when the file changes) as a task in a split and opens the PDF beside the source (`core/docBuild.ts`). Defaults: `typ` wraps and formats on save, `tex` and `txt` wrap. Open: problem lines reach the quickfix list only when the watcher ends; `tectonic`, `texlab`, `pyright`, `yaml-language-server`, `taplo` aren't installed here, so only highlighting and the typst build were run; the server tables are untested against real servers.

## M67 – Small daily things

- Done 2026-11-11: pasting an image into a Markdown buffer saves it as `assets/image-<date>-<time>.<ext>` next to the file (new `WorkspaceService.WriteNew`, never replaces a file, Go test) and inserts `![](assets/…)` (`editor/pasteImage.ts`, naming in `core/pasteImage.ts`); `<Space>fy` copies `path:line` of the cursor. Already there before this item and so not built: line ending and word count in the status line, binary guard (`ErrBinary`), SVG as code with its image beside it, dropping a file from the OS onto the window, tab drag and drop, terminal panel header. Open: the paste handler was not tried with a real clipboard in the app.

## M68 – Debugger: program stderr

- Done 2026-11-11: the debugged program's stderr reaches the output buffer (`<Space>dl`). Delve lets the program inherit its own stderr, which `internal/dap` sent to the app's stderr; `StartWithOutput` now pipes it and calls `onOut(category, text)` with `"stdout"` or `"stderr"`, `app/dap.go` turns both into output events with that category. Go test (`TestStartWithOutputPassesStdoutAndStderr`), the Delve E2E checks a `println` line. Plan: `docs/plans/2026-11-11-debugger-plan.md`. Delve's own log lines on stderr show up there too.

## M69 – Debugger: adapter table and stdio mode

- Done 2026-11-12: debug adapters table (`debug/adapters.ts`) replaces Go-only launch arguments and active file targets; `app/dap.go` dispatches to configured adapters and checks availability; `internal/dap` adds `StartStdio` for stdio-based debug adapters alongside Delve's TCP socket connection. Unit tests in `adapters.test.ts`, `debugger.test.ts`, and `internal/dap/dap_test.go`.

## Later

| | What | Plugs into |
|---|---|---|
| L1 Tasks/build | run commands by key (`go test`, `make`, `pio run`), output in the terminal, errors in quickfix | `pty` + `quickfix` |
| L2 Git | ~~changes in the gutter~~ (M19), ~~status in the tree~~ (M29), ~~diff view~~ (M30) | `git` process, CM6 gutter |
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
