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
