//go:build windows

// Package proc starts helper programs (language servers, debug adapters, terminals) the way each OS needs.
package proc

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

func init() {
	curPath := os.Getenv("PATH")
	enriched := EnrichPath(curPath)
	if enriched != curPath {
		_ = os.Setenv("PATH", enriched)
	}
}

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

// Available reports whether the program of command is on PATH, or at its relative path below dir.
func Available(dir, _, command string) bool {
	bin := ProgramOf(command)
	if bin == "" {
		return false
	}
	if strings.ContainsAny(bin, `/\`) && !filepath.IsAbs(bin) {
		bin = filepath.Join(dir, bin)
	}
	_, err := exec.LookPath(bin)
	return err == nil
}

// Kill is Terminate: taskkill /F already ends the tree for good.
func Kill(cmd *exec.Cmd) error { Terminate(cmd); return nil }

// Terminate ends the command and the programs it started.
func Terminate(cmd *exec.Cmd) {
	kill := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid))
	SetHideWindow(kill)
	if kill.Run() != nil {
		cmd.Process.Kill()
	}
}
