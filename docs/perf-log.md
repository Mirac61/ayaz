# Performance log

Measurements against the budgets in [00-vision.md](00-vision.md#performance-budgets). Newest first. Machine: M-series MacBook (ProMotion), macOS 27.2.

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
