//go:build windows

// Package proc starts helper programs (language servers, debug adapters, terminals) the way each OS needs.
package proc

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
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

// taskkillTimeout bounds taskkill, so a hanging taskkill cannot block a shutdown.
const taskkillTimeout = 3 * time.Second

// Kill is Terminate: taskkill /F already ends the tree for good. It returns the error of the Process.Kill fallback.
func Kill(cmd *exec.Cmd) error { return taskkill(cmd) }

// Terminate ends the command and the programs it started.
func Terminate(cmd *exec.Cmd) { _ = taskkill(cmd) }

// taskkill ends the tree; when taskkill fails or exceeds taskkillTimeout it kills just the process and returns that error.
func taskkill(cmd *exec.Cmd) error {
	ctx, cancel := context.WithTimeout(context.Background(), taskkillTimeout)
	defer cancel()
	kill := exec.CommandContext(ctx, "taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid))
	SetHideWindow(kill)
	if kill.Run() == nil {
		return nil
	}
	return cmd.Process.Kill()
}
