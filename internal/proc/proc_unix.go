//go:build !windows

// Package proc starts helper programs (language servers, debug adapters, terminals) the way each OS needs.
package proc

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

func init() {
	// Ensure common developer bin directories (.zshrc, Mason, mise, nvm, brew) are in PATH even when launched
	// from macOS Finder or Launchpad.
	curPath := os.Getenv("PATH")
	enriched := EnrichPath(curPath)
	if enriched != curPath {
		_ = os.Setenv("PATH", enriched)
	}
}

// Shell is the user's shell.
func Shell() string {
	if s := os.Getenv("SHELL"); s != "" {
		return s
	}
	return "/bin/sh"
}

// ShellArgs are the arguments for an interactive login shell, or one that runs cmd. A login shell, because a
// Finder-started app has a bare PATH.
func ShellArgs(cmd string) []string {
	if cmd == "" {
		return []string{"-l"}
	}
	return []string{"-l", "-c", cmd}
}

// Command runs command in its own process group through the login shell, which finds tools in the user's PATH
// (~/go/bin, Homebrew, Mason, mise, nvm, .zshrc).
func Command(shell, command string) *exec.Cmd {
	curPath := os.Getenv("PATH")
	cmdStr := "exec " + command
	if curPath != "" {
		cmdStr = "export PATH=" + quoteShell(curPath) + "; " + cmdStr
	}
	cmd := exec.Command(shell, "-l", "-c", cmdStr)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return cmd
}

// Available reports whether command's program is found on PATH or by the login shell. A relative path
// (./agent) is looked up in dir, the folder the command will run in; "" means the app's own.
func Available(dir, shell, command string) bool {
	bin := ProgramOf(command)
	if bin == "" {
		return false
	}
	if strings.Contains(bin, "/") && !filepath.IsAbs(bin) {
		bin = filepath.Join(dir, bin)
	}
	if _, err := exec.LookPath(bin); err == nil {
		return true
	}
	curPath := os.Getenv("PATH")
	cmdStr := "command -v " + quoteShell(bin)
	if curPath != "" {
		cmdStr = "export PATH=" + quoteShell(curPath) + "; " + cmdStr
	}
	probe := exec.Command(shell, "-l", "-c", cmdStr)
	probe.Dir = dir
	return probe.Run() == nil
}

// Terminate asks the command's process group to end (SIGTERM; the program it started goes with it).
func Terminate(cmd *exec.Cmd) { syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM) }

// Kill ends the command's process group for good, for a program that ignored Terminate.
func Kill(cmd *exec.Cmd) error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
