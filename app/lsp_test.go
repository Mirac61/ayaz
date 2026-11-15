package app

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/Mirac61/ayaz/internal/workspace"
)

// Library files read only below a root; a symlink out of it or a sibling with the root as prefix is refused.
func TestReadLibrary(t *testing.T) {
	root, other := t.TempDir(), t.TempDir()
	lib := filepath.Join(root, "goroot")
	os.MkdirAll(filepath.Join(lib, "src"), 0o755)
	os.WriteFile(filepath.Join(lib, "src", "a.go"), []byte("package a"), 0o644)
	os.WriteFile(filepath.Join(other, "secret"), []byte("x"), 0o644)
	os.Symlink(filepath.Join(other, "secret"), filepath.Join(lib, "src", "link"))
	os.MkdirAll(filepath.Join(root, "goroot2"), 0o755)
	os.WriteFile(filepath.Join(root, "goroot2", "b.go"), []byte("x"), 0o644)

	f, err := readLibrary([]string{lib}, filepath.Join(lib, "src", "a.go"))
	if err != nil || f.Content != "package a" {
		t.Fatalf("inside: %q %v", f.Content, err)
	}
	for _, p := range []string{filepath.Join(lib, "src", "link"), filepath.Join(root, "goroot2", "b.go"), filepath.Join(other, "secret")} {
		if _, err := readLibrary([]string{lib}, p); !errors.Is(err, workspace.ErrOutside) {
			t.Errorf("%s: want ErrOutside, got %v", p, err)
		}
	}
}
