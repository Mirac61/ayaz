//go:build !darwin

package app

import "github.com/wailsapp/wails/v3/pkg/application"

// UncapFrameRate is a no-op: WebKitGTK follows the monitor's refresh rate on its own (unverified, check in S1).
func UncapFrameRate(*application.WebviewWindow) {}
