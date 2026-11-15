//go:build server

package app

import "github.com/wailsapp/wails/v3/pkg/application"

// CloseTabNotWindow: the server build has no window menu.
func CloseTabNotWindow(*application.App) {}
