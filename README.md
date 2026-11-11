# Ayaz

A keyboard-first code editor with a Neovim feel. It shows Markdown, PDFs and images properly and has a real terminal built in. Built with [Wails v3](https://v3.wails.io) (Go) and CodeMirror 6 (TypeScript).

![CI](https://github.com/Mirac61/ayaz/actions/workflows/ci.yml/badge.svg)

## Features

- **Vim, not an imitation of it:** motions, text objects (also structural ones: functions, arguments), operators, `.`, registers, macros, visual and block mode, `:` commands, surround.
- **Language servers** for Go, C/C++, TypeScript/JavaScript, HTML/CSS/JSON and Java: diagnostics, completion, hover, go to definition, rename, code actions, semantic colours, call hierarchy.
- **Debugging** Go programs with Delve (breakpoints, stepping, variables).
- **Markdown** that renders while you type, a reading view, and a side-by-side preview. A button at the top right of a Markdown or SVG pane switches between rendered view and source.
- **PDF and images** (PNG, JPG, GIF, WebP, SVG) in the same panes as text.
- **A real terminal** (xterm.js on a PTY): TUI programs such as `htop`, `lazygit` and `nvim` work.
- **Git** in the editor: gutter marks, status in the tree, diff against HEAD, inline blame, stage and reset hunks, merge-conflict helpers.
- **Project search and replace**, fuzzy file finder, command palette, quickfix list, project tasks.
- **One folder per window**, session and unsaved changes restored per folder, local file history.
- **Colour swatches** before hex colours; click one to pick a new colour.
- Everything is a command and has a key. Bindings, settings and snippets are plain JSON files you edit in the app.

## Install

Ayaz is built from source; there are no release downloads yet. Each platform needs **Go**, **[Bun](https://bun.sh)**, **[Task](https://taskfile.dev)** and the Wails CLI:

```sh
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0
git clone https://github.com/Mirac61/ayaz && cd ayaz
task install
```

`task install` builds the app and installs it for the current user:

| Platform | What it does | Extra requirements |
|---|---|---|
| macOS | builds `bin/ayaz.app`, copies it to `/Applications/Ayaz.app` | Xcode Command Line Tools |
| Linux | binary to `~/.local/bin/ayaz`, launcher entry to `~/.local/share/applications` | `gtk4`, `webkitgtk-6.0` and their `-dev` packages |
| Windows | `ayaz.exe` to `%LOCALAPPDATA%\Ayaz` and a Start menu shortcut | WebView2 (part of Windows 11) |

Arch Linux can use the package instead: `cd build/linux/arch && makepkg -si`.

The macOS app isn't notarized. If macOS blocks the first start, right-click → Open. `task install` already removes the quarantine flag.

**Windows is new and has not been run on a real machine yet.** See [docs/08-windows.md](docs/08-windows.md) for what changed and what to check first.

### Language servers (optional)

Ayaz starts them through your login shell (on Windows: from `PATH`), so whatever you have installed works. A missing server shows a hint in the status line.

| Language | Server |
|---|---|
| Go | `go install golang.org/x/tools/gopls@latest` (debugging: `dlv`) |
| C/C++ | `clangd` (Xcode Command Line Tools, or `clang` on Arch); a `compile_commands.json` gives it the real flags |
| TS/JS | `bun add -g typescript typescript-language-server` |
| HTML/CSS/JSON | `bun add -g vscode-langservers-extracted` |
| Java | `jdtls` (Homebrew or AUR) |

## Use

```sh
ayaz ~/code/project        # open a folder (macOS: /Applications/Ayaz.app/Contents/MacOS/ayaz)
ayaz main.go:12            # with Ayaz running: open the file at that line in the window of its folder
EDITOR="ayaz --wait" git commit   # git waits until the buffer is closed
```

The leader key is `Space`. A few bindings to start with:

| Keys | Does |
|---|---|
| `<Space>ff` / `fw` / `fk` | find files / search text / command palette |
| `<Space>e` | focus the file tree |
| `<Space>t` | terminal panel |
| `<Space>mr` / `mp` | Markdown reading view / preview split |
| `<Space>cr` / `ca` | rename / code action |
| `<Space>gb` / `gd` / `gg` | blame / diff / lazygit |
| `<Space>dd` / `db` / `dc` | start debugging / breakpoint / continue |
| `<C-w>v` / `s` | split right / down |

The welcome page lists more. Everything is a command ID: `<Space>fk` shows them all, and the keymap file (settings window) rebinds any of them. The defaults with comments are in [`app/keymap.default.json`](app/keymap.default.json).

Settings live in `~/Library/Application Support/ayaz` (macOS), `~/.config/ayaz` (Linux) or `%AppData%\ayaz` (Windows).

## Develop

```sh
wails3 dev                        # hot reload
task build                        # binary in bin/
go test ./...                     # Go tests
cd frontend
bun install
bun run typecheck && bun run lint
bun run test                      # unit tests (Vitest, Node)
bun run test:browser              # component tests (Vitest browser mode, WebKit)
bun run e2e                       # Playwright against the server build (see docs/04-testing.md)
```

CI (`.github/workflows/ci.yml`) runs Go vet and tests on macOS and Linux, a Windows cross-build, the frontend checks, and the browser and E2E tests on both.

| Folder | Contents |
|---|---|
| `app/` | Wails services: workspace, terminal, language servers, debugger, settings |
| `internal/` | Go packages: `workspace` (path jail, file ops), `lsp`, `dap`, `pty`, `proc`, `git`, `search`, `index`, `watch`, `fsserve` |
| `frontend/src/` | `editor/` (CodeMirror, Vim, Markdown), `shell/` (panes, tree, picker), `viewers/` (images, PDF, browser), `terminal/`, `debug/`, `core/`, `theme/` |
| `build/` | per-platform packaging (`darwin`, `linux`, `windows`) |
| `docs/` | vision, research, architecture, ADRs, roadmap, test strategy |

## Docs

[Vision](docs/00-vision.md) · [Architecture](docs/02-architecture.md) · [Performance](docs/03-performance.md) · [Testing](docs/04-testing.md) · [Roadmap](docs/05-roadmap.md) · [Manual checks](docs/07-manual-checks.md) · [Windows](docs/08-windows.md) · [Decisions (ADRs)](docs/adr/)

## Status

Daily-usable on macOS and Arch Linux/Hyprland. Windows is untested. No licence has been chosen yet, so all rights are reserved until one is added.
