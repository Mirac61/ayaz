package workspace

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTrashItemGoesToTheTrash(t *testing.T) {
	p := filepath.Join(t.TempDir(), "ayaz-trash-test.txt")
	os.WriteFile(p, []byte("x"), 0o644)
	to, err := trashItem(p)
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(to) // don't leave test files in the user's Trash
	if _, err := os.Stat(p); !os.IsNotExist(err) {
		t.Fatalf("still there: %v", err)
	}
	if b, err := os.ReadFile(to); err != nil || string(b) != "x" {
		t.Fatalf("not in the Trash at %q: %v", to, err)
	}
	if _, err := trashItem(p); err == nil {
		t.Fatal("trashing a missing file succeeded")
	}
}
