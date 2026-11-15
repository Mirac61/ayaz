//go:build windows

package proc

import (
	"os/exec"
	"syscall"
)

// SetHideWindow ensures child console processes do not pop up a window when
// spawned from a GUI application on Windows.
func SetHideWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags |= 0x08000000 // CREATE_NO_WINDOW
}
