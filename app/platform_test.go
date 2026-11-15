package app

import (
	"runtime"
	"testing"
)

func TestDetectPlatform(t *testing.T) {
	p := detectPlatform()
	if p == "" {
		t.Fatal("expected non-empty platform")
	}
	switch runtime.GOOS {
	case "darwin":
		if p != "darwin" {
			t.Fatalf("expected darwin, got %s", p)
		}
	case "windows":
		if p != "windows" {
			t.Fatalf("expected windows, got %s", p)
		}
	case "linux":
		if p != "linux" && p != "linux-arch" && p != "linux-debian" && p != "linux-fedora" {
			t.Fatalf("unexpected linux platform: %s", p)
		}
	}
}

func TestParseDistro(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
	}{
		{"ubuntu", "NAME=\"Ubuntu\"\nID=ubuntu\nID_LIKE=debian\n", "linux-debian"},
		{"debian", "ID=debian\n", "linux-debian"},
		{"arch", "ID=arch\nBUILD_ID=rolling\n", "linux-arch"},
		{"manjaro", "ID=manjaro\nID_LIKE=arch\n", "linux-arch"},
		{"fedora", "NAME=Fedora\nID=fedora\n", "linux-fedora"},
		{"rhel", "ID=\"rhel\"\nID_LIKE=\"fedora\"\n", "linux-fedora"},
		{"unknown", "ID=void\n", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := parseDistro(tc.content)
			if got != tc.want {
				t.Errorf("parseDistro(%q) = %q, want %q", tc.name, got, tc.want)
			}
		})
	}
}
