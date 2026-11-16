# Build and install from source

Needs **Go**, **[Bun](https://bun.sh)**, **[Task](https://taskfile.dev)** and the Wails CLI:

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

For hot reload use `wails3 dev`; for a binary only, `task build` (it lands in `bin/`). Windows notes: [08-windows.md](08-windows.md).

## Language servers (optional)

Ayaz starts them through your login shell (on Windows: from `PATH`), so whatever you have installed works. A missing server shows a hint in the status line.

| Language | Server |
|---|---|
| Go | `go install golang.org/x/tools/gopls@latest` |
| C/C++ | `clangd` (Xcode Command Line Tools, or `clang` on Arch); a `compile_commands.json` gives it the real flags |
| TypeScript, JavaScript | `bun add -g typescript typescript-language-server` |
| HTML, CSS, JSON, YAML | `bun add -g vscode-langservers-extracted yaml-language-server` |
| Java | `jdtls` (Homebrew or AUR) |
| Python | `pyright-langserver` (`bun add -g pyright`) |
| Rust | `rust-analyzer` |
| Lua | `lua-language-server` |
| TOML | `taplo` |
| Dockerfile | `docker-langserver` (`bun add -g dockerfile-language-server-nodejs`) |
| LaTeX, Typst | `texlab`, `tinymist` |

Debugging needs the adapter for the language: `dlv` (Go), `debugpy` (Python), `lldb-dap` (C, C++, Rust).
