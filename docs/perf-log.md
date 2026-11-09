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
