package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSwapWriteReadRemove(t *testing.T) {
	t.Setenv("AYAZ_CACHE_DIR", t.TempDir())
	if got, err := readSwaps("/p"); err != nil || len(got) != 0 {
		t.Fatalf("no swaps yet: %v, %v", got, err)
	}
	if err := writeSwap("/p", "a/deep/main.go", "package a\n"); err != nil {
		t.Fatal(err)
	}
	if err := writeSwap("/p", "a/deep/main.go", "package b\n"); err != nil { // replaces
		t.Fatal(err)
	}
	if err := writeSwap("/other", "x.go", "other folder\n"); err != nil {
		t.Fatal(err)
	}
	got, err := readSwaps("/p")
	if err != nil || len(got) != 1 || got[0] != (Swap{Path: "a/deep/main.go", Text: "package b\n"}) {
		t.Fatalf("readSwaps = %v, %v", got, err)
	}
	if err := removeSwap("/p", "a/deep/main.go"); err != nil {
		t.Fatal(err)
	}
	if err := removeSwap("/p", "a/deep/main.go"); err != nil { // gone already: fine
		t.Fatal(err)
	}
	if got, _ := readSwaps("/p"); len(got) != 0 {
		t.Fatalf("after remove: %v", got)
	}
	if got, _ := readSwaps("/other"); len(got) != 1 {
		t.Fatalf("the other folder's swap went too: %v", got)
	}
}

func TestReadSwapsSkipsBrokenFiles(t *testing.T) {
	t.Setenv("AYAZ_CACHE_DIR", t.TempDir())
	if err := writeSwap("/p", "ok.txt", "fine"); err != nil {
		t.Fatal(err)
	}
	dir, _ := swapDir("/p")
	if err := os.WriteFile(filepath.Join(dir, "broken.json"), []byte("{half"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got, err := readSwaps("/p"); err != nil || len(got) != 1 || got[0].Path != "ok.txt" {
		t.Fatalf("readSwaps = %v, %v", got, err)
	}
}
