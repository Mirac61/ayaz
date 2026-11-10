//go:build !server

package app

import "github.com/wailsapp/wails/v3/pkg/application"

// CloseTabNotWindow moves the menu's "Close" from Cmd+W to Cmd+Shift+W: Cmd+W reaches the page and closes the tab.
func CloseTabNotWindow(a *application.App) {
	menu := application.DefaultApplicationMenu()
	if item := menu.FindByLabel("Close"); item != nil {
		item.SetAccelerator("CmdOrCtrl+Shift+w")
	}
	a.Menu.Set(menu)
}
