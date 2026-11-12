package app

import (
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// Platform returns the operating system and Linux distribution/package manager:
// "darwin", "windows", "linux-debian", "linux-arch", "linux-fedora", or "linux".
func (s *WorkspaceService) Platform() string {
	return detectPlatform()
}

func detectPlatform() string {
	switch runtime.GOOS {
	case "darwin":
		return "darwin"
	case "windows":
		return "windows"
	case "linux":
		return detectLinuxDistro()
	default:
		return runtime.GOOS
	}
}

func parseDistro(content string) string {
	c := strings.ToLower(content)
	// Normalize quotes around values
	c = strings.ReplaceAll(c, `"`, "")
	c = strings.ReplaceAll(c, `'`, "")
	if strings.Contains(c, "id=arch") || strings.Contains(c, "id_like=arch") || strings.Contains(c, "id=manjaro") {
		return "linux-arch"
	}
	if strings.Contains(c, "id=ubuntu") || strings.Contains(c, "id=debian") || strings.Contains(c, "id_like=debian") {
		return "linux-debian"
	}
	if strings.Contains(c, "id=fedora") || strings.Contains(c, "id=rhel") || strings.Contains(c, "id=centos") || strings.Contains(c, "id_like=fedora") {
		return "linux-fedora"
	}
	return ""
}

func detectLinuxDistro() string {
	if b, err := os.ReadFile("/etc/os-release"); err == nil {
		if d := parseDistro(string(b)); d != "" {
			return d
		}
	}
	if _, err := exec.LookPath("pacman"); err == nil {
		return "linux-arch"
	}
	if _, err := exec.LookPath("apt-get"); err == nil {
		return "linux-debian"
	}
	if _, err := exec.LookPath("dnf"); err == nil {
		return "linux-fedora"
	}
	return "linux"
}
