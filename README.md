# Ayaz

Keyboard-first code editor with an nvim feel, Markdown/PDF/images and a real terminal. Wails v3 + React/TS.

Docs: [docs/](docs/) · Roadmap: [docs/05-roadmap.md](docs/05-roadmap.md)

## Develop

Needs Go, Bun, [Task](https://taskfile.dev) and the Wails CLI pinned to the version in `go.mod`:

```sh
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0
wails3 dev        # hot reload
wails3 build      # binary in bin/
go test ./...
```

## Install

### macOS (unsigned `.app`)

Needs Go, Bun, Task and `wails3` as above.

```sh
git clone https://github.com/Mirac61/ayaz && cd ayaz
(cd frontend && bun install)
task darwin:package           # bin/ayaz.app, ad-hoc signed
cp -R bin/ayaz.app /Applications/Ayaz.app
```

The app isn't notarized. If macOS blocks the first start: right-click → Open, or `xattr -dr com.apple.quarantine /Applications/Ayaz.app`.
From a terminal: `/Applications/Ayaz.app/Contents/MacOS/ayaz <folder>` opens a folder directly.

### Arch Linux (Hyprland)

```sh
git clone https://github.com/Mirac61/ayaz && cd ayaz/build/linux/arch
makepkg -si                   # builds ayaz-git: /usr/bin/ayaz + .desktop entry
```

Runtime: `gtk4`, `webkitgtk-6.0`. Other distributions: build with `task build`, then copy `bin/ayaz` into your `PATH` and `build/linux/ayaz.desktop` to `~/.local/share/applications/`.

### Language servers (optional)

Ayaz starts them through your login shell, so whatever is in your `PATH` works. Missing ones show a hint in the status line.

| Language | Server |
|---|---|
| Go | `go install golang.org/x/tools/gopls@latest` |
| C/C++ | `clangd` (Xcode Command Line Tools, or `clang` on Arch); a `compile_commands.json` gives it the real flags |
| TS/JS | `bun add -g typescript typescript-language-server` |
| HTML/CSS/JSON | `bun add -g vscode-langservers-extracted` |
| Java | `jdtls` (Homebrew or AUR) |
