//go:build windows

// Package proc starts helper programs (language servers, debug adapters, terminals) the way each OS needs.
package proc

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
)

// Shell is PowerShell.
func Shell() string {
	if s, err := exec.LookPath("powershell.exe"); err == nil {
		return s
	}
	return os.Getenv("ComSpec")
}

// ShellArgs are the arguments for an interactive PowerShell, or one that runs cmd.
func ShellArgs(cmd string) []string {
	if cmd == "" {
		return []string{"-NoLogo"}
	}
	return []string{"-NoLogo", "-Command", cmd}
}

// Command runs command through cmd.exe; the shell argument is unused. shortcut: no process group, Terminate kills
// the tree with taskkill; upgrade to a job object if that proves flaky.
func Command(_, command string) *exec.Cmd {
	cmd := exec.Command("cmd.exe", "/C", command)
	SetHideWindow(cmd)
	return cmd
}

// Available reports whether the program of command is on PATH.
func Available(_, command string) bool {
	f := strings.Fields(command)
	if len(f) == 0 {
		return false
	}
	_, err := exec.LookPath(f[0])
	return err == nil
}

// Terminate ends the command and the programs it started.
func Terminate(cmd *exec.Cmd) {
	kill := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid))
	SetHideWindow(kill)
	if kill.Run() != nil {
		cmd.Process.Kill()
	}
}
