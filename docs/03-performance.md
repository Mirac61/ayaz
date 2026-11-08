# 03 – Performance

Updated 2026-11-08 · Budget numbers (K1–K16) are in [00-vision.md](00-vision.md#performance-budgets). This doc covers how they're measured and how we hit them.

## Principles

- **Measure before optimizing.** Every budget gets an automated measurement from the milestone that touches it.
- **Don't load what isn't visible.** pdf.js, xterm.js, LSP and the separate preview are separate chunks.
- **Only render the viewport.** CM6 does this already; the tree and picker are virtualized too.
- **Move work to Go when it doesn't need the DOM** (index, matching, listings). Go runs in parallel, the WebView has one main thread.
- **WebView processes count.** Most RAM and CPU is spent there, not in Go.

## How each budget is measured

| # | Start → end | Tool | From |
|---|---|---|---|
| K1 | process start → `app:ready` (sent after the tree first paints) | `hyperfine` with `AYAZ_EXIT_ON_READY=1`, 10 runs, median + p95 | M0 |
| K2 | 10 s after `app:ready`, one file open | macOS: `footprint` over the Go process + `com.apple.WebKit.*` children (process mapping to be figured out in M0). Linux: PSS from `/proc/<pid>/smaps_rollup` over the process tree | M0 |
| K3 | `file.open` → first paint with decorations | `performance.mark/measure`, logged via a binding | M1, again M6 |
| K4 | `keydown` → next `requestAnimationFrame` after the transaction | editor provider instrumentation + Vitest browser benchmark (WebKit), 500 keys | M1, again M6 |
| K5 | rAF deltas during programmatic scrolling | rAF delta logger in debug builds (`long-animation-frame` in WebKit unverified) | M1, again M6 |
| K6 | `file.open` → pdf.js `pagerendered` for page 1 | EventBus listener + `performance.measure` | M11 |
| K7 | `find` dispatched → last `updatefindmatchescount` | same | M11 |
| K8 | RAM before opening vs. after scrolling to page 200 | same as K2 | M11 |
| K9 | binding call → list rendered | `go test -bench` for the matcher + frontend round trip | M2 |
| K10 | walk start → `index:ready` | `go test -bench` on a generated tree + app log | M2 |
| K11 | file written → `fs:changed` in the frontend | Go integration test + E2E | M3 |
| K12 | build artifact | `du` in CI | M0 |
| K13 | key in terminal → character rendered | xterm `onRender` + timestamp at `keydown` (event name checked in S6) | M4 |
| K14 | command start → prompt back | wall clock in a script, compared with a native terminal and nvim `:terminal` | M4 |
| K15 | search start → first / last hit in the frontend | `go test -bench` on `repo50k`, compared with `rg` | M8 |
| K16 | transport adapter → Go and back | echo server instead of a real LSP, 1,000 messages | M7 |

### Test data (`testdata/perf/`, generated, not committed)
- `big.md`: 5,000 lines with headings, lists, 20 tables, 30 code blocks, 50 image references
- `200p.pdf`: 200 pages of text and images, freely licensed or generated
- `repo50k/`: generated tree with 50,000 files, realistic depth (~6) and names

### In CI
- Go benchmarks on every push, compared with `benchstat` against `main` (not blocking at first).
- Frontend benchmarks nightly or manually. CI machines vary too much for hard limits.
- K1/K2/K6–K8 on the real machines before closing each milestone, results in `docs/perf-log.md`.

## Techniques

### Cold start (K1)
- Minimal entry point: shell + tree + basic editor. Everything else (pdf.js, xterm.js, languages, preview, palette, LSP) via `import()`.
- Go starts indexing, watching and LSP only after `app:ready`, asynchronously.
- The tree only loads the first level; each folder lists lazily when opened.
- No web fonts from the network. One local monospace font.

### Loading and caching
- `ReadText` runs in Go. The frontend shows nothing until the answer arrives (no loader under 100 ms).
- Directory listings are cached per folder in the frontend and invalidated only by `fs:changed`.
- `/fs/` responses carry `ETag`/`Last-Modified`, so images come from the WebView cache the second time (custom-scheme caching checked in M10).
- Index lives in memory. A disk cache only if K10 fails on real repos.

### Editor and Markdown (K3–K5)
- Decorations only for `visibleRanges`, rebuilt only on `docChanged | selectionSet | viewportChanged`.
- Lezer parses incrementally; for huge files CM6 keeps parsing in the background (behavior checked in M5).
- Image widgets: `loading="lazy"`, `decoding="async"`, cached height from the last render (no scroll jumps), max width = editor width.
- Table widgets only for visible tables. The cursor line shows source.

### PDF (K6–K8)
- `PDFViewer` renders only visible pages and keeps a limited buffer of rendered pages (buffer size measured in M11).
- Cap `maxCanvasPixels` (default 4096 × 4096). Blurry at high zoom beats running out of memory.
- Range requests over `/fs/` if Spike S2 works, otherwise load the whole file.
- Text layer on (needed for search, cheap for visible pages).
- Worker is required (parsing off the main thread).

### Terminal (K13, K14)
- Batch PTY output in Go instead of sending every `read()`. That was the measured bottleneck in another terminal.
- Send when ~4–8 ms have passed or ~16 KB are waiting, whichever comes first (tuned in S6). A single keystroke echo after idle is sent immediately, never held back.
- Renderer per platform after measuring. WebGL contexts only for visible terminals.
- Limit scrollback (e.g. 10,000 lines, configurable).
- Hidden terminals don't render but keep buffering.

### Languages and LSP (K3, K16)
- Language packages via `import()` on the first file of that language.
- LSP servers start on the first matching file, not when the folder opens. Their RAM is reported separately from K2.
- Send `didChange` incrementally if the client supports it, otherwise full text (~200 KB for 5,000 lines) with debouncing.

### Project search (K15)
- Go worker pool (one per CPU core) over the index file list, no new walk.
- Stream results in chunks; the frontend renders them virtualized.
- New input cancels the running search (`context.Context`).

### Images
- Shown directly via `<img src="/fs/...">`. The browser decodes natively and async.
- No thumbnails for now, nothing needs them. If a gallery comes, Go generates them and caches in `os.UserCacheDir()/ayaz/thumbs/`.
- Very large images (> 50 MP): warn instead of hanging (limit measured in M10).

### File tree and picker
- Virtualized lists, only visible rows in the DOM. Matters especially on WebKitGTK.
- Go returns the top 50 matches with match positions.
- No debouncing of the query: every keystroke is sent, stale answers are dropped by sequence number. Debouncing would add latency, and K9 is ≤ 30 ms.

### Linux/WebKitGTK
- Hardware acceleration (DMA-BUF) must be on. In M0 find out how to check it (maybe `webkit://gpu`).
- No CSS effects that are expensive without compositing (`backdrop-filter`, big shadows, blur).

## Deliberately not done
- No own file content cache. The OS page cache is enough.
- No prefetching of files that might be opened.
- No web workers in the frontend besides pdf.js, as long as budgets hold.
