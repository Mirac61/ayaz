# Windows

Status: cross-compiles from macOS, **never run on Windows**. Test notes for whoever tries it first.

## Build

Needs Go, Bun, [Task](https://taskfile.dev) and `wails3` (`go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0`). WebView2 comes with Windows 11.

```
git clone https://github.com/Mirac61/ayaz && cd ayaz
task install      # builds bin\ayaz.exe, copies it to %LOCALAPPDATA%\Ayaz, adds a Start menu shortcut
```

Only building: `task build` (needs `CGO_ENABLED=0`, the default in `build/windows`). `task windows:package` makes an NSIS installer and needs NSIS.

## What changed for Windows

- `internal/proc`: starts language servers and debug adapters (`cmd.exe /C` instead of a login shell), ends them with `taskkill /T`.
- `internal/pty/session_windows.go`: the terminal runs on ConPTY (Windows 10 1809 or newer); the shell is PowerShell.
- `internal/workspace/trash_windows.go`: delete goes to the Recycle Bin.
- `build/windows`: manifest, icon, installer from `wails3 init`.

## Check first

- [ ] The window opens and the folder tree loads.
- [ ] The terminal opens, typing and resizing work, closing leaves no `powershell.exe` behind.
- [ ] `gopls` / `typescript-language-server` start (they must be on PATH) and show diagnostics.
- [ ] Debugging with `dlv`; stopping ends the program.
- [ ] Deleting a file puts it in the Recycle Bin.
- [ ] Key bindings: the keymap says `Cmd` in places; check what `Ctrl` does.
- [ ] Mac-only things hang or are missing: glass window, application menu, AeroSpace workspaces.
- [ ] Paths with `\` and drive letters in the quickfix list and the file picker.
