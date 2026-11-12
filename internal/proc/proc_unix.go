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
	// Ensure common developer bin directories are in PATH even when launched from macOS Finder or Launchpad
	home, _ := os.UserHomeDir()
	var extraPaths []string
	if home != "" {
		extraPaths = []string{
			filepath.Join(home, "go", "bin"),
			filepath.Join(home, ".cargo", "bin"),
			filepath.Join(home, ".bun", "bin"),
			filepath.Join(home, ".local", "bin"),
			filepath.Join(home, "bin"),
		}
	}
	extraPaths = append(extraPaths,
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
	)

	curPath := os.Getenv("PATH")
	var toAdd []string
	for _, p := range extraPaths {
		if !strings.Contains(curPath, p) {
			toAdd = append(toAdd, p)
		}
	}
	if len(toAdd) > 0 {
		_ = os.Setenv("PATH", strings.Join(toAdd, ":")+":"+curPath)
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
// (~/go/bin, Homebrew).
func Command(shell, command string) *exec.Cmd {
	cmd := exec.Command(shell, "-l", "-c", "exec "+command)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return cmd
}

// Available reports whether the login shell finds command's program.
func Available(shell, command string) bool {
	return exec.Command(shell, "-l", "-c", "command -v "+command).Run() == nil
}

// Terminate ends the command's process group (the program it started goes with it).
func Terminate(cmd *exec.Cmd) { syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM) }
