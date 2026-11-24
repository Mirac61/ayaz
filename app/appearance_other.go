//go:build !darwin

package app

import "github.com/wailsapp/wails/v3/pkg/application"

// setWindowLight is a no-op: only the macOS backdrop follows the window's appearance.
func setWindowLight(application.Window, bool) {}
