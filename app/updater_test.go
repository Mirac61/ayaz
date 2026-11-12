package app

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

func TestMatchAssetDarwin(t *testing.T) {
	assets := []github.ReleaseAsset{
		{Name: "SHA256SUMS"},
		{Name: "ayaz-linux-amd64.tar.gz"},
		{Name: "ayaz-windows-amd64.zip"},
		{Name: "ayaz-macos-arm64.zip"},
	}

	req := updater.CheckRequest{
		Platform: "darwin",
		Arch:     "arm64",
	}

	idx := MatchAsset(req, assets)
	if idx != 3 {
		t.Fatalf("MatchAsset for darwin arm64 = %d; want 3 (%s)", idx, assets[3].Name)
	}
}

func TestMatchAssetWindows(t *testing.T) {
	assets := []github.ReleaseAsset{
		{Name: "SHA256SUMS"},
		{Name: "ayaz-linux-amd64.tar.gz"},
		{Name: "ayaz-windows-amd64.zip"},
		{Name: "ayaz-macos-arm64.zip"},
	}

	req := updater.CheckRequest{
		Platform: "windows",
		Arch:     "amd64",
	}

	idx := MatchAsset(req, assets)
	if idx != 2 {
		t.Fatalf("MatchAsset for windows amd64 = %d; want 2 (%s)", idx, assets[2].Name)
	}
}

func TestMatchAssetLinux(t *testing.T) {
	assets := []github.ReleaseAsset{
		{Name: "SHA256SUMS"},
		{Name: "ayaz-linux-amd64.tar.gz"},
		{Name: "ayaz-windows-amd64.zip"},
		{Name: "ayaz-macos-arm64.zip"},
	}

	req := updater.CheckRequest{
		Platform: "linux",
		Arch:     "amd64",
	}

	idx := MatchAsset(req, assets)
	if idx != 1 {
		t.Fatalf("MatchAsset for linux amd64 = %d; want 1 (%s)", idx, assets[1].Name)
	}
}

func TestMatchAssetSkipsSidecars(t *testing.T) {
	assets := []github.ReleaseAsset{
		{Name: "ayaz-macos-arm64.zip.sig"},
		{Name: "ayaz-macos-arm64.sha256"},
		{Name: "notes.txt"},
	}

	req := updater.CheckRequest{
		Platform: "darwin",
		Arch:     "arm64",
	}

	idx := MatchAsset(req, assets)
	if idx != -1 {
		t.Fatalf("MatchAsset should return -1 for sidecars, got %d", idx)
	}
}

func TestResolveGitHubToken(t *testing.T) {
	t.Setenv("AYAZ_GITHUB_TOKEN", "test-token-123")
	if tok := ResolveGitHubToken(); tok != "test-token-123" {
		t.Fatalf("ResolveGitHubToken = %q; want 'test-token-123'", tok)
	}
}
