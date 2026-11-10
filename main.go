package main

import (
	"embed"
	"log"
	"os"

	"github.com/Mirac61/ayaz/app"
	"github.com/Mirac61/ayaz/internal/fsserve"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	ws := app.NewWorkspaceService(os.Args[1:])
	a := application.New(application.Options{
		Name:        "Ayaz",
		Description: "Keyboard-first code editor",
		Services: []application.Service{
			application.NewService(&app.PingService{}),
			application.NewService(ws),
			application.NewService(&app.ConfigService{}),
		},
		Assets: application.AssetOptions{
			Handler:    application.AssetFileServerFS(assets),
			Middleware: fsserve.Middleware(ws.Registry()),
		},
		ShouldQuit: ws.ShouldQuit, // Cmd+Q asks every window first, like its close button
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.OnReady(a)
	a.HandleStream("pty", ws.HandleTerminal)
	a.HandleStream("lsp", ws.HandleLSP)
	a.HandleStream("search", ws.HandleSearch)
	a.HandleStream("echo", app.HandleEcho)

	app.NewWindow(a, "", "/")

	if err := a.Run(); err != nil {
		log.Fatal(err)
	}
}
