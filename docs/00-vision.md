# 00 – Vision

Updated 2026-11-08 · Phase 0 (planning only) · Working title: **Ayaz**

## In one sentence

A code editor that feels like Neovim, shows Markdown, PDFs and images properly, and has a real terminal built in.

## Why

- **VSCodium** is heavy (Electron, extension host, many processes), and Vim is only an emulation.
- **Neovim** can't show PDFs or images and has no real Markdown live preview.
- **Obsidian** forces a vault, isn't a code editor, and isn't keyboard-first the Vim way.

## Goals

**Code editor (the core)**
- Open any folder or Git repo. No vault, no metadata written into the folder.
- Full language support (highlighting + LSP: diagnostics, completion, go to definition, hover, rename, format), in this order:
  1. Go
  2. C/C++
  3. Web: TypeScript/JavaScript, HTML, CSS, JSON
  4. Java
- At least highlighting for Markdown, YAML, TOML, shell, Dockerfile, Makefile.
- Project-wide search and replace.
- A **real terminal**: shell in the project folder, TUI programs (htop, lazygit, nvim) work correctly.
- Vim feel: motions, text objects, operators, `.`, registers, macros, visual/block mode. This is the biggest product risk, see [01 §4](01-research.md#4-codemirror-6--vim).

**Viewing**
- Markdown with live preview inside the editor (headings, emphasis, links, code, tables, inline images), plus an optional separate preview.
- PDF: scroll, zoom, full-text search.
- Images: PNG, JPG, GIF (animated), WebP, SVG.

**Controls and windows**
- Keyboard-first: every action is a command and has a key.
- File tree and fuzzy finder.
- Splits with a buffer list. A tab bar can be turned on in settings.
- Like VS Code: open another folder in the same window, or open a new window. One folder per window.
- Explicit save (`:w`, `Cmd/Ctrl+S`).
- Theme: Kanagawa (*wave* first).
- Platforms: macOS (primary, arm64) and Linux on Hyprland/Wayland (Intel UHD).

## Later (planned, not in the first pass)

- Run tasks/builds with a quickfix list
- Git (changes in the gutter, status in the tree, diff view)
- Debugger via DAP (Delve for Go first)

## Non-goals (for now)

- 100 % Vim compatibility or Vimscript/Lua config. The goal is the feel, not a clone.
- Third-party plugins
- Sync, cloud, accounts
- Windows
- Multi-root (several folders in one window)
- Editing PDFs or images

## Hard requirements

| Requirement | What it means |
|---|---|
| Fast | The budgets below are measured, not guessed. CI catches regressions. |
| Tested | Every layer has automated tests ([04](04-testing.md)). No milestone is done without tests. |
| Modular | Viewers and the terminal are swappable providers. Go services don't know about Wails. The frontend talks to Go only through one adapter ([02](02-architecture.md)). |

## Performance budgets

These are the single source for all budget numbers. How each one is measured is in [03](03-performance.md).

Reference machines: my Mac (Apple Silicon) and the Hyprland PC with Intel UHD. The numbers are starting points. In M0 they get checked against a baseline (Neovim in a terminal, VSCodium, Obsidian on the same machines) and adjusted if needed.

| # | What | macOS | Linux |
|---|---|---|---|
| K1 | Cold start until the window is usable (folder open, tree visible) | ≤ 500 ms | ≤ 800 ms |
| K2 | Idle RAM, all processes incl. WebKit, one file open, no LSP | ≤ 150 MB | ≤ 200 MB |
| K3 | Open a 5,000-line file (Markdown or Go) until editable | ≤ 200 ms | ≤ 300 ms |
| K4 | Typing latency in that file, p95 (key to frame) | ≤ 16 ms | ≤ 25 ms |
| K5 | Scrolling that file | no frame > 50 ms | no frame > 50 ms |
| K6 | 200-page PDF: first page visible | ≤ 500 ms | ≤ 800 ms |
| K7 | 200-page PDF: full-text search over all pages | ≤ 3 s | ≤ 4 s |
| K8 | 200-page PDF: extra RAM after scrolling through | ≤ 300 MB | ≤ 300 MB |
| K9 | Fuzzy finder, 50,000-file repo: results per keystroke | ≤ 30 ms | ≤ 30 ms |
| K10 | Fuzzy finder: build the index (50,000 files, warm FS cache) | ≤ 1 s | ≤ 1 s |
| K11 | External file change visible in tree/buffer | ≤ 500 ms | ≤ 500 ms |
| K12 | App size (binary or `.app`) | ≤ 30 MB | ≤ 30 MB (without system WebKitGTK) |
| K13 | Terminal echo latency (key to character), p95 | ≤ 16 ms | ≤ 25 ms |
| K14 | Terminal: run `seq 1 1000000` | ≤ 3 s | ≤ 5 s |
| K15 | Project search, 50,000 files, literal: first hits / done | ≤ 100 ms / ≤ 2 s | ≤ 100 ms / ≤ 2 s |
| K16 | LSP bridge overhead per message (excluding server time), p95 | ≤ 5 ms | ≤ 5 ms |

Notes:
- Linux gets more headroom because WebKitGTK renders slower. With Intel UHD and Mesa the GPU path should work fine ([01 §3](01-research.md#3-webkitgtk-on-linuxwayland)).
- K2 counts the WebKit helper processes. LSP servers (gopls, clangd, jdtls) are separate processes and reported separately, because they often use more RAM than the editor itself.
- K14: for comparison, measure the same command in Neovim's terminal and in a native terminal on the same machine.
- K12 is without signing/notarization.

## Success in one sentence

I write Go and C code, read datasheets as PDFs and maintain Markdown docs in Ayaz instead of nvim + a preview app + VSCodium, and every action feels instant.
