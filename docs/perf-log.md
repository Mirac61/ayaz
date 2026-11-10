# Performance log

Measurements against the budgets in [00-vision.md](00-vision.md#performance-budgets). Newest first. Machine: M-series MacBook (ProMotion), macOS 27.2.

## 2026-11-08 · M3 file watching (macOS)
| | Value | Budget | How |
|---|---|---|---|
| K11 file written → batch in Go | median 113 ms, max 115 ms (30 writes) | ≤ 500 ms | scratch test on `internal/watch` (FSEvents); 50 ms cooldown + 50 ms batch window |

Notes:
- Go → frontend adds one Wails event plus one `ReadText` per open buffer; the E2E test (`external changes reach tree and clean buffers`) passes well inside Playwright's default timeout.
- Linux (inotify) not measured yet, CI runs the same tests there.

## 2026-11-08 · M2 fuzzy finder (macOS)

| | Value | Budget | How |
|---|---|---|---|
| K9 matcher, 50,000 paths, per keystroke | 1.3–8.1 ms (worst: "cmdrouter", 19k candidates scored) | ≤ 30 ms | `go test -bench=Find ./internal/index` |
| K10 index build, 50,000 files, warm cache | 0.84 s (walk); Git repos use `git ls-files` instead | ≤ 1 s | `go test -bench=BuildWalk ./internal/index` |

Notes:
- K9 adds the binding round trip (S4: p95 0.35 ms) and rendering 50 rows; not measured end to end yet.
- K10 is close to the budget. The walk does one `ReadDir` per folder; if real repos outside Git miss it, walk folders in parallel.

## 2026-11-08 · M1 editor (macOS)

App state: folder open (this repo), tree visible, no file open. The terminal is no longer in the default view (`?view=term`).

| | Value | Budget (macOS) | How |
|---|---|---|---|
| K1 start → `app:ready` | median 389 ms, range 367–407 ms (20 runs) | ≤ 500 ms | `hyperfine -w 2 -r 20 -N 'env AYAZ_EXIT_ON_READY=1 ./bin/ayaz <folder>'` |
| K2 idle RAM after 10 s | 96 MB (ayaz ~32, WebContent 41, GPU 18, Networking 5); welcome screen 91 MB | ≤ 150 MB | `scripts/ram.sh bin/ayaz <folder>` |
| K12 binary size | 10.6 MB | ≤ 30 MB | `ls -l bin/ayaz` |

Notes:
- K2 dropped from 150 MB (M0) because the xterm WebGL renderer isn't in the default view anymore. It comes back with the bottom panel in M4, so measure again then.
- The first run right after a fresh build gave 287 MB (GPU 120, WebContent 128). Three runs after that gave 96–97 MB. Probably a one-time effect after the build, worth watching.

## 2026-11-08 · M0 skeleton (macOS)

App state: terminal view only, no folder or file open yet, so K1/K2 are a lower bound for later milestones.

| | Value | Budget (macOS) | How |
|---|---|---|---|
| K1 start → `app:ready` | median 378 ms, max 429 ms (20 runs) | ≤ 500 ms | `hyperfine -w 2 -r 20 -N 'env AYAZ_EXIT_ON_READY=1 ./bin/ayaz'` |
| K2 idle RAM after 10 s | 150 MB (ayaz 34, WebContent 83, GPU 28, Networking 5) | ≤ 150 MB | `scripts/ram.sh` |
| K12 binary size | 9.2 MB | ≤ 30 MB | `ls -l bin/ayaz` after `wails3 build` |
| K13 terminal echo p95 | 3 ms | ≤ 16 ms | bench mode, see 01-research S6 |
| K14 `seq 1 1000000` | 1.1 s | ≤ 3 s | bench mode |
| K16 stream echo p95 (0.2 KB / 200 KB) | 0.3 ms / 1.2 ms | ≤ 5 ms | bench mode |

Notes:
- K2 is already at the budget with an empty terminal. The WebContent process (83 MB) is most of it. Check again in M1 with the editor open; if it grows past 150 MB, look at the xterm WebGL renderer (GPU process) and scrollback first.
- On macOS the WebKit processes are XPC services owned by launchd, not children of ayaz. `scripts/ram.sh` takes the WebKit processes that appear after launch. That's wrong if another WebKit app starts in those 10 s.

## 2026-11-09 – K3/K5 on `big.md`, coarse (headless WebKit, not the app)

`frontend/src/editor/big.browser.test.ts` opens `testdata/big.md` (5,000 lines, 20 tables, 30 code blocks, 50 image references, made by `scripts/gen-bigmd.mjs`) with mdlive and scrolls to the end in 300 px steps. Three runs, M5 + M6 blocks (no images yet):

| | Value | How |
|---|---|---|
| K3-like: `createState` + 2 frames | 52–57 ms | `performance.now()` around the open, language loaded |
| K5-like: frame delta while scrolling | p95 19 ms, worst 24–28 ms (401 frames) | rAF deltas, the test fails over 50 ms |

Not the real K3/K5 numbers: no WKWebView, no GPU, headless timer. The real check on macOS and Hyprland comes with M6's "done when". `mdTables` walks the whole tree on every update; it did not show up here.

## 2026-11-09 – K16, Go half (M7)

`TestK16Framing` in `internal/lsp`: Content-Length framing + pipe + `cat` as echo server and back, 1,000 messages per size, three runs (macOS, Go test, not the app).

| | Value | Budget |
|---|---|---|
| K16 framing + pipe p95 (0.2 KB / 200 KB) | 0.02 ms / 0.15–0.19 ms | ≤ 5 ms |
| K16 total p95, stream (S7) + framing (0.2 KB / 200 KB) | ~0.3 ms / ~1.4 ms | ≤ 5 ms |

Notes:
- The JS adapter (`streamTransport`) adds one `TextEncoder`/`TextDecoder` pass per message, not measured separately. Hyprland still open.

## 2026-11-09 – K15 project search (M8)

`BenchmarkK15` in `internal/search`: 50,000 generated `.go` files (2.7 KB each, 500 folders), one hit, warm page cache, macOS (12 cores). Go test, not the app; streaming adds one 30 ms batch window.

| | Value | Budget |
|---|---|---|
| K15 literal, case-sensitive: first hit / done | 71 ms / 514 ms | ≤ 100 ms / ≤ 2 s |
| K15 smart case (lower-case query, no prefilter): first hit / done | 308 ms / 542 ms | — |

Notes:
- The one hit sits in a random place, so "first hit" is when that file was reached. With many hits the first batch leaves after ≤ 30 ms.
- Cold cache and Hyprland not measured. Not compared with `rg` yet.

## 2026-11-09 – K6/K7 PDF (M11, S3 partly)

`frontend/e2e/pdf.spec.ts` against the server build in headless WebKit (Playwright), `testdata/e2e-ws/big.pdf` (200 text pages, 875 KB, from `scripts/gen-bigpdf.mjs`). One run.

| | Value | Budget (macOS) |
|---|---|---|
| K6 open → page 1 rendered | 95 ms | ≤ 500 ms |
| K7 search over 200 pages, "find" → final state | 254 ms | ≤ 3 s |
| K8 RAM after scrolling through | not measured | ≤ 300 MB |

Notes:
- Text-only pages render fast; a PDF with images and embedded fonts will be slower. Check with a real paper or book in the app.
- Not the WKWebView/WebKitGTK numbers S3 asks for.

## 2026-11-09 – M14, macOS (M-series), production build

Full app with a folder open (`testdata/e2e-ws`), windows sent to a hidden AeroSpace workspace while measuring.

| | Value | Budget (macOS) | How |
|---|---|---|---|
| K1 start → `app:ready` | 398 ms ± 7 (15 runs) | ≤ 500 ms | `hyperfine -w 2 -r 15 -N 'env AYAZ_EXIT_ON_READY=1 ./bin/ayaz testdata/e2e-ws'` |
| K2 idle RAM 10 s, folder open | 111 MB (ayaz 32, WebContent 59, GPU 16, Networking 5) | ≤ 150 MB | `scripts/ram.sh bin/ayaz testdata/e2e-ws`, 3 runs |
| K2 idle RAM 10 s, welcome screen | 103 MB | ≤ 150 MB | same, no folder |
| K12 binary size | 13.1 MB (`.app` 14 MB) | ≤ 30 MB | `ls -l bin/ayaz` |

Notes:
- On a hidden workspace the GPU process stays at 16 MB; with the window visible, 6 earlier runs gave 105–124 MB total plus one outlier of 236 MB. `scripts/ram.sh` also counts any other WebKit process that starts in those 10 s, which explains a 622 MB outlier.
- Hyprland still open for all K numbers.

## 2026-11-09 – K8 PDF RAM and scroll frames (M11)

`AYAZ_SPIKE=k8 scripts/ram.sh bin/ayaz <copy of testdata/e2e-ws>`: the app idles 10 s (before), opens `big.pdf`, scrolls through all 200 pages at 8,000 px/s per animation frame like a fast trackpad (`spikes/pdfRam.ts`), waits 3 s (after). Production build, Retina (dpr 2).

| | Before → after | K8 extra (≤ 300 MB) | Frames while scrolling p50 / p95 / max |
|---|---|---|---|
| pdf.js defaults, window visible, pane 1237×875 | 119 → 567 MB | +448 MB | 9 / 63 / 91 ms |
| `maxCanvasPixels` 5 MP, window visible, pane 1237×407 | 107 → 330 MB | +223 MB | 10 / 18 / 28 ms |
| pdf.js defaults, hidden window, pane 1237×875 | 121 → 598 MB | +477 MB | – |
| `maxCanvasPixels` 5 MP, hidden window, pane 1237×875, 4 runs | 102–112 → 308–424 MB | +206 / +209 / +210 / +312 MB | – |

Notes:
- Cause: pdf.js keeps the last 10 rendered pages (not an option of `PDFViewer`). At page width on Retina each page canvas is 2392×3098 px, ~30 MB, and WebKit holds a second copy for display. With `maxCanvasPixels: 5242880` (pdf.js' own value for phones) the kept pages render at 1005×1300 and only the visible part is drawn sharp on top (detail canvas). Now on.
- The rest of "after" is WebKit malloc (~+100 MB: pdf.js and its worker) and layer memory; it didn't drop within 20 s.
- Hidden windows read lower and sometimes stall `requestAnimationFrame`, so frame times come from visible runs only; AeroSpace gave the two visible runs different pane heights. One hidden run read 281 → 1004 MB, not explained, not counted.
- Tried and dropped: `enableHWA: true` (GPU canvas): +259 MB, slower rendering, 1 GB for a moment.
- 120 fps isn't reached while pages render: pdf.js draws on the main thread in ~15 ms slices. Getting there needs rendering off the main thread (OffscreenCanvas in the worker). Trackpad scrolling runs on WebKit's scrolling thread and isn't covered by this measure.

## 2026-11-09 – K8 and scroll frames with the render worker (M11)

Same measure as above, now waiting 2 s after opening before scrolling (opening cost one ~80 ms frame, not scrolling), and a third step after closing the PDF. Window visible, pane 1237×875, 3 runs each.

| | Frames p50 / p95 / max | Frames > 17 ms (of ~4,650) | K8 extra (≤ 300 MB) |
|---|---|---|---|
| Main thread (above) | 10 / 18 / 28 ms | – | +223 MB |
| Render worker | 8 / 12 / 20–22 ms | 5–9 | +267 / +274 / +280 MB |
| Render worker, detail canvas after scroll stops | 8 / 10 / 17–19 ms | 0–2 | +277 / +282 MB (3rd run's "before" was off) |

Notes:
- WebKit rounds `requestAnimationFrame` times to 1 ms, so a 120 Hz frame (8.3 ms) reads 8 or 9; p95 10 is ~5 % of frames one tick late.
- With the worker alone, 91–95 % of frames over 13 ms got a new bitmap (47 % of the others). Copying it costs the main thread nothing (60–80 ms in the whole run); the upload of the new canvas (up to 4.4 MP) is what costs the frame.
- Why so many: the visible pane is 4.3 MP at dpr 2, `maxCanvasPixels` 5.2 MP, so pdf.js' detail canvas is barely larger than the visible area and redrew in about every other frame. In a 1237×407 pane it had room and frames were already 8 / 9–10 / 14–15 ms.
- Fix like Chrome and Preview: while scrolling, the pages show their low-resolution canvas; the sharp detail canvas follows 100 ms after the scroll stops (pdf.js' own `ignoreDetailViews`, forced while scrolling).
- "Closed" (PDF pane closed, worker terminated, 5 s later) read 309, 426 and 442 MB; WebKit doesn't give the memory back within 5 s. Not explained.
- Gate from the plan (p95 ≤ 9, max ≤ 17) is met in effect but not to the letter: p95 10, one or two 18–19 ms frames per 40 s scroll.

## 2026-11-10 – Big files and a big repository (M51)

Files: `frontend/src/editor/large.browser.test.ts`, headless WebKit (rAF at 60 Hz, so frames read 17–18 ms; "per key" is the transaction, DOM update and a forced layout, measured synchronously). Pane 800×600.

| File | Open | Git HEAD set | Per key (start of line 1) | Scroll frames p95 / max |
|---|---|---|---|---|
| 10 MB Go (165k lines) | 84–102 ms | 26–30 ms | 3–4 ms | 18 / 21–33 ms |
| 10 MB, plain | 48 ms | 19 ms | 1–2 ms | 18 / 18 ms |
| 20 MB Go | 61 ms | 35 ms | 2 ms | 20 / 46 ms |
| 50 MB Go | 83 ms | 94 ms | 2 ms | 86 / 591 ms |
| 50 MB, plain | 88 ms | 103 ms | 2 ms | 94 / 166 ms |
| 1 MB line, JS | 51–56 ms | 10 ms | **25 ms** | 18 / 19 ms |
| 1 MB line, plain | 19–28 ms | 16 ms | 2 ms | 18 / 19 ms |

Per key with JS highlighting by line length: 2 KB 5 ms, 4 KB 4, 8 KB 5, 16 KB 6, 32 KB 15, 64 KB 16, 128 KB–1 MB 24–25 ms; a 1 MB JSON line 27 ms (64 KB: 7 ms). At the end of the long line it is 2–4 ms in every case.

Repository: `scripts/bigrepo.sh` (Go 1.27 `src`, 11,964 files, committed in a fresh repo), `AYAZ_BIG_REPO=… go test ./app -run BigRepo -v`, median of 5 (find: 20).

| Index build | Fuzzy find | Project search (literal, 4 hits) | `git status` | `git status` after a change |
|---|---|---|---|---|
| 45–62 ms | 0.4 ms | 150–158 ms | 63–66 ms | 60–65 ms |

Limits from this:
- A file with a line over 20,000 characters opens without highlighting (`LONG_LINE` in `editor.ts`): the cost is the line, not the file. With it, the 1 MB line types at 2 ms.
- No size limit: up to 20 MB, typing stays at 2–4 ms. From 50 MB, scrolling drops frames with or without highlighting (CodeMirror's own height map and DOM), not fixed.
- A repository of this size needs no limit: `git status` on every save and change stays under 70 ms and runs off the UI.
