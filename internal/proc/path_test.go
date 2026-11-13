package proc

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseZshrcPaths(t *testing.T) {
	fakeHome := "/Users/testuser"
	content := `
# Some comment
export PATH="/usr/local/bin:$PATH"
export PATH="$HOME/.local/bin:$PATH"
PATH="${HOME}/bin:${PATH}:/custom/tool"
path+=('/Users/testuser/.cargo/bin')
path+=("${HOME}/.bun/bin")
path=('/opt/homebrew/bin' $path)
# export PATH="/commented/out:$PATH"
`
	paths := parseZshrcPaths(content, fakeHome)
	expected := []string{
		"/usr/local/bin",
		"/Users/testuser/.local/bin",
		"/Users/testuser/bin",
		"/custom/tool",
		"/Users/testuser/.cargo/bin",
		"/Users/testuser/.bun/bin",
		"/opt/homebrew/bin",
	}

	if len(paths) != len(expected) {
		t.Fatalf("got %d paths, want %d: %v", len(paths), len(expected), paths)
	}
	for i, want := range expected {
		if paths[i] != want {
			t.Errorf("at [%d]: got %q, want %q", i, paths[i], want)
		}
	}
}

func TestDetectMasonPaths(t *testing.T) {
	temp := t.TempDir()
	masonBin := filepath.Join(temp, ".local", "share", "nvim", "mason", "bin")
	if err := os.MkdirAll(masonBin, 0755); err != nil {
		t.Fatal(err)
	}

	paths := detectMasonPaths(temp)
	if len(paths) != 1 || paths[0] != masonBin {
		t.Errorf("expected [%q], got %v", masonBin, paths)
	}
}

func TestDetectMisePaths(t *testing.T) {
	temp := t.TempDir()
	miseShims := filepath.Join(temp, ".local", "share", "mise", "shims")
	miseBin := filepath.Join(temp, ".local", "bin")
	if err := os.MkdirAll(miseShims, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(miseBin, 0755); err != nil {
		t.Fatal(err)
	}

	paths := detectMisePaths(temp)
	if len(paths) != 2 {
		t.Fatalf("expected 2 paths, got %v", paths)
	}
	if paths[0] != miseShims || paths[1] != miseBin {
		t.Errorf("expected [%q, %q], got %v", miseShims, miseBin, paths)
	}
}

func TestDetectNvmPaths(t *testing.T) {
	temp := t.TempDir()
	nodeV20 := filepath.Join(temp, ".nvm", "versions", "node", "v20.10.0", "bin")
	nodeV22 := filepath.Join(temp, ".nvm", "versions", "node", "v22.1.0", "bin")
	if err := os.MkdirAll(nodeV20, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(nodeV22, 0755); err != nil {
		t.Fatal(err)
	}

	// Set default alias to v20
	aliasDir := filepath.Join(temp, ".nvm", "alias")
	if err := os.MkdirAll(aliasDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(aliasDir, "default"), []byte("v20.10.0\n"), 0644); err != nil {
		t.Fatal(err)
	}

	paths := detectNvmPaths(temp)
	if len(paths) != 2 {
		t.Fatalf("expected 2 paths, got %v", paths)
	}
	// Default alias v20 should be first, followed by v22
	if paths[0] != nodeV20 {
		t.Errorf("expected default %q first, got %q", nodeV20, paths[0])
	}
	if paths[1] != nodeV22 {
		t.Errorf("expected %q second, got %q", nodeV22, paths[1])
	}
}

func TestEnrichPath(t *testing.T) {
	orig := "/usr/bin:/bin"
	enriched := EnrichPath(orig)
	if !strings.Contains(enriched, orig) {
		t.Errorf("enriched PATH %q does not contain original %q", enriched, orig)
	}

	// Verify no duplicates
	parts := strings.Split(enriched, string(os.PathListSeparator))
	seen := make(map[string]bool)
	for _, p := range parts {
		if seen[p] {
			t.Errorf("duplicate path found in enriched PATH: %q", p)
		}
		seen[p] = true
	}
}

func TestAvailableAndCommand(t *testing.T) {
	shell := Shell()
	if !Available(shell, "ls") {
		t.Errorf("ls should be available")
	}
	if Available(shell, "non_existent_binary_xyz_12345") {
		t.Errorf("non_existent_binary should not be available")
	}

	cmd := Command(shell, "echo 'hello world'")
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}
	if !strings.Contains(string(out), "hello world") {
		t.Errorf("unexpected output: %q", string(out))
	}
}
