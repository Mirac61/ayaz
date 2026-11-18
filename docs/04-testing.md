# 04 – Testing

Updated 2026-11-16

## At a glance

| Layer | Command | Runs in CI | What it covers |
|---|---|---|---|
| Go | `go test -race ./...` | yes | `internal/*` and `app/` |
| Frontend, Node | `bun run --cwd frontend test` | yes | pure logic (`*.test.ts`), no DOM |
| Frontend, browser | `bun run --cwd frontend test:browser` | **no, run it yourself** | anything with a real `EditorView`, xterm or pdf.js (`*.browser.test.ts`, WebKit) |
| E2E | `task build:server`, then `bun run --cwd frontend e2e` | **no, run it yourself** | the whole app against the server build (`frontend/e2e/*.spec.ts`) |
| Manual | [07 – Manual checks](07-manual-checks.md) | no | native window, dialogs, real clipboard, Hyprland |

`task test` runs Go, typecheck and the Node tests in one go. CI (`ci.yml`, one Ubuntu job) adds `golangci-lint`, `govulncheck` and the frontend lint. Change anything in the UI, CodeMirror or the DOM: run the browser tests before you push.

## Why these layers

![Test pyramid: manual, E2E, browser, Node and Go tests, from few and slow to many and fast](diagrams/test-pyramid.svg)

Cut logic so it can be tested in the lowest layer that works.

- **Go services** are plain structs, so `go test` needs no Wails and no WebView.
- **CM6 and jsdom don't mix:** jsdom has no layout, no `ResizeObserver`, no coordinates. `EditorState` logic runs in Node, anything with `EditorView` runs in browser mode.
- **Vitest browser mode** uses Playwright's `webkit` engine. It is close to WKWebView and WebKitGTK, but not identical.
- **E2E** is Playwright against the Wails *server build* (`task build:server`): real Go services, a normal browser, no native window. Playwright starts a fresh copy of `testdata/e2e-ws` as a git repository, with its own config and cache folders, so tests never touch your settings.
- **Native WebView automation** doesn't exist in a usable form, so what only a real window shows is on the manual list.

## Go

| Package | Kind | What |
|---|---|---|
| `workspace` | table tests, **fuzzing** | `Resolve`: `..`, `%2e%2e`, absolute paths, symlinks pointing out, Unicode normalization (NFC/NFD on macOS). Atomic write: an abort leaves the original. Registry: closing stops watcher, PTYs and LSP |
| `fsserve` | `httptest`, fuzzing | 200, 206 on `Range`, 304 on `If-None-Match`, 403/404 outside the root, HEAD |
| `watch` | integration with `t.TempDir()` | create/change/rename → event within timeout; own writes filtered; an atomic save gives exactly one `changed` |
| `index` | table tests, golden rankings, benchmarks, fuzzing | "query → expected top hit"; no panic on any input |
| `search` | table tests, benchmarks | literal/regex/case, binary files skipped, cancel via context, replace |
| `pty` | integration with `/bin/sh` | output arrives complete and in order, resize, exit code, close kills the process group |
| `lsp`, `dap` | unit + fake server | framing with split and merged reads, restart after a crash, shutdown on close. Real `gopls` or Delve only if installed |
| `git` | tests on real temporary repositories | status, blame, hunks, stage and reset |
| `proc` | unit | login-shell `PATH` lookup |
| `app` | wiring tests | config, history, swap, terminal, workspace service; no logic of its own |

The watcher behaves differently per OS, so run `go test` on macOS as well as Linux before a release. The race detector is always on.

## Frontend, Node (`*.test.ts`)

- `core/commands`, `core/keymap`: registering, context resolution, conflicts.
- `editor/mdlive`: the decoration function `(EditorState, ranges) → [{from, to, kind}]`, as explicit arrays.
- `core/settings`, `core/snippets`, `core/tasks` and the other pure helpers in `core/`.
- `backend.ts` is replaced by a fake backend everywhere (in-memory file system).

## Frontend, browser (`*.browser.test.ts`)

- **Editor and Vim:** mount a real `EditorView`, send keys with `userEvent`: `dd`, `ciw`, `:w` calls `file.save`, leader mappings.
- **Vim core list:** a table "keys + start text → expected text and cursor" for the list below. Every failure is a documented gap in codemirror-vim.
- **Terminal:** the xterm provider with a fake stream: bytes in → text in the buffer, keys → bytes out, `Ctrl-\ Ctrl-n` switches mode, `file:line:col` links.
- **LSP client:** an editor with a fake transport (recorded answers): a diagnostic becomes a lint marker, the completion list opens.
- **Markdown live preview:** markers hidden outside the cursor line, visible on it; image and table widgets render.
- **Viewers:** PDF rendering in a worker, images, HTML.

### Vim core list

The basics that must feel exactly like nvim:

| Group | Keys |
|---|---|
| Moving | `h j k l`, `w b e`, `W B E`, `0 ^ $`, `gg G`, `{number}G`, `f t F T ; ,`, `%`, `Ctrl-d Ctrl-u`, `H M L`, `zz` |
| Search | `/ ?`, `n N`, `* #` |
| Insert | `i a I A o O`, `Esc`, `jk` (own mapping) |
| Edit | `x`, `r`, `dd yy cc`, `D C`, `p P`, `u Ctrl-r`, `.`, `J`, `>> <<`, `~` |
| Operators + motions | `d c y` with any motion above (`dw`, `c$`, `y}`, `dG` …), counts (`3dd`, `5j`) |
| Text objects | `iw aw`, `i" a"`, `i' a'`, `i( a(`, `i{ a{`, `i[ a[`, `it at`, `ip ap` |
| Visual | `v V Ctrl-v`, `o`, operators on the selection, `I A` in block mode |
| Registers | `"ay "ap`, `"+y "+p` (system clipboard), `"0p` |
| Macros | `qa … q`, `@a`, `@@` |
| Marks and jumps | `ma 'a`, `Ctrl-o Ctrl-i` |
| Ex | `:w :q :wq :e`, `:s` / `:%s` with flags, `:{number}` |
| Folds | `za zc zo zR zM` |

Not needed for v1: `:g`, `:normal`, `gv`, `Ctrl-a/Ctrl-x`, `gq`, spell checking.

## E2E

The specs in `frontend/e2e/` are grouped by feature: editor, tree, search, terminal, LSP, debugger, git, PDF and images, sessions and hot exit, config, windows. Each one drives a real page against the server build. Some need a tool on the machine (`gopls`, `clangd`, Delve, `clang`) and skip with a message when it is missing. The debugger spec also needs `AYAZ_DEBUG_E2E=1` (on macOS it needs developer tools access).

Not reachable here: native windows, OS menus, native file dialogs. The server build also serves files through the browser's network path, not the app's custom scheme, so scheme bugs (Range, caching) only show in the real app.

## Manual checks

The list lives in [07 – Manual checks](07-manual-checks.md). Aim for 10 minutes; if it takes longer, automate something.

## Independent review (agent runs)

Unbeaufsichtigte Agent-Läufe (`scripts/agent-night.sh`) committen nur mit einem
unabhängigen Review. Der Reviewer ist ein eigener, read-only Subagent
(`.claude/agents/reviewer.md`) mit frischem Kontext und eigenem Auftrag: Bugs,
Edge Cases, Sicherheit, Testqualität und Scope. Er gibt `VERDICT: PASS` nur ohne
BLOCKER, SHOULD-FIX und offene Entscheidung.

| Befehl | Was passiert |
|---|---|
| `/review [fokus]` | Prüft den aktuellen Diff, ändert nichts |
| `/work [task-id]` | Setzt einen Waypoint-Task um, reviewt, fixt Findings, committet (kein Push) |
| `scripts/agent-night.sh` | Blockiert den Task statt eines PRs, wenn das Urteil nicht PASS ist |

Im Nachtlauf startet der Host den Reviewer selbst (`claude -p --agent reviewer`)
auf dem finalen Diff; der Bericht des Umsetzers zählt nicht als Nachweis, weil er
ihn selbst schreiben könnte. Das gilt auch für den CodeRabbit-Folgepfad am Ende
des Laufs: Fixes am PR werden ohne Host-PASS weder committet noch gepusht, der
Reviewer-Bericht landet dann als Kommentar am PR. Der Umsetzer reviewt vorher
trotzdem, damit Findings noch vor dem Ende behoben sind — committet wird nur nach
dem Host-Urteil.

Die Modelle sind getrennt: Umsetzen auf `sonnet` (`--model sonnet` in
`scripts/agent-night.sh`, im Chat `sonnet` oder `opus`), Review auf `opus` mit
`effort: high`. Ein Reviewer auf demselben Modell teilt die blinden Flecken des
Umsetzers und winkt zu viel durch; `/review` und `/work` im Chat prüfen deshalb
auch dann mit `opus`, wenn die Session auf `sonnet` läuft. Wer das Monatslimit
schonen muss, setzt in `.claude/agents/reviewer.md` `model: inherit`; das Review
wird dadurch schwächer, nicht das Gate.

Das Gate selbst ist getestet: `bash scripts/review-gate-test.sh` (läuft in
`task test`) prüft, dass ein selbst geschriebener PASS ohne Host-Urteil
blockiert, dass ein PASS trotz fehlgeschlagenem Reviewer blockiert und dass nur
ein sauber beendeter Reviewer mit `VERDICT: PASS` durchkommt.

Der Reviewer ersetzt keine Tests und keine manuellen Prüfungen: native Fenster,
WebKit, Performance und Aussehen bleiben in [07 – Manual checks](07-manual-checks.md).

## CI

One job (`ci.yml`) on Ubuntu for every pull request and push to `main` or `dev`:

1. `golangci-lint` (Go lint and format)
2. `go test -race ./...`
3. `govulncheck`
4. frontend: `bun install --frozen-lockfile`, typecheck, lint, Node tests

`release.yml` builds the macOS, Windows and Linux archives on `v*` tags.

## When is a change "tested"?

- Every new Go function with branches has a test.
- Every new command has a test that runs it through the registry.
- UI behaviour has a browser test or an E2E scenario.
- Affected budgets are measured and logged in [perf-log](perf-log.md).

Sources: [Wails testing](https://wails.io/guides/testing/) · [Wails E2E](https://wails.io/guides/e2e-testing/) · [Vitest browser mode](https://vitest.dev/guide/browser/why)
