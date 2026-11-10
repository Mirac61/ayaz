package app

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWatchConfigReportsSavedFiles(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "ayaz") // missing: watchConfig creates it
	ctx := t.Context()
	got := make(chan string, 8)
	if err := watchConfig(ctx, dir, func(f string) { got <- f }); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	os.WriteFile(filepath.Join(dir, "other.txt"), []byte("x"), 0o644)
	os.WriteFile(filepath.Join(dir, "keymap.json"), []byte("[]"), 0o644)
	select {
	case f := <-got:
		if f != "keymap.json" {
			t.Fatalf("got %q, want keymap.json", f)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no change reported")
	}
}
