package main

import (
	"embed"
	"log"
	"os"

	"github.com/Mirac61/ayaz/app"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
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
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.OnReady(a)
	a.HandleStream("pty", ws.HandleTerminal)
	a.HandleStream("echo", app.HandleEcho)

	win := a.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Ayaz",
		Width:  1200,
		Height: 800,
		// Kanagawa sumiInk1, so there is no white flash before the first paint.
		BackgroundColour: application.NewRGB(0x1f, 0x1f, 0x28),
		URL:              "/",
	})
	win.OnWindowEvent(events.Common.WindowRuntimeReady, func(*application.WindowEvent) {
		app.UncapFrameRate(win)
	})

	if err := a.Run(); err != nil {
		log.Fatal(err)
	}
}
