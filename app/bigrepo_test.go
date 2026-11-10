package app

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"github.com/Mirac61/ayaz/internal/git"
	"github.com/Mirac61/ayaz/internal/index"
	"github.com/Mirac61/ayaz/internal/search"
)

// M51: what a big repository costs per call (docs/perf-log.md). Set AYAZ_BIG_REPO to a Git checkout, e.g. a copy of
// $(go env GOROOT)/src committed in a fresh repo; scripts/bigrepo.sh makes one.
func TestBigRepo(t *testing.T) {
	root := os.Getenv("AYAZ_BIG_REPO")
	if root == "" {
		t.Skip("AYAZ_BIG_REPO not set")
	}
	median := func(n int, f func()) time.Duration {
		var ds []time.Duration
		for range n {
			t0 := time.Now()
			f()
			ds = append(ds, time.Since(t0))
		}
		sort.Slice(ds, func(i, j int) bool { return ds[i] < ds[j] })
		return ds[n/2]
	}

	var ix *index.Index
	build := median(5, func() {
		var err error
		if ix, err = index.Build(root, false); err != nil {
			t.Fatal(err)
		}
	})
	find := median(20, func() { ix.Find("httpserver", 50) })
	re, err := search.Compile(search.Options{Query: "func NewRequest"})
	if err != nil {
		t.Fatal(err)
	}
	hits := 0
	grep := median(5, func() {
		hits = 0
		search.Run(context.Background(), root, ix.Paths(), re, func(h []search.Hit) { hits += len(h) })
	})
	status := median(5, func() {
		if _, err := git.Status(root); err != nil {
			t.Fatal(err)
		}
	})
	// A save: one file changed, then status again (what every save and the 1 s poll ask).
	file := filepath.Join(root, ix.Paths()[0])
	old, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	defer os.WriteFile(file, old, 0o644)
	if err := os.WriteFile(file, append(old, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
	changed := median(5, func() {
		if _, err := git.Status(root); err != nil {
			t.Fatal(err)
		}
	})
	t.Logf("BIGREPO %d files: index %v, find %v, grep %v (%d hits), git status %v, after a change %v",
		ix.Len(), build, find, grep, hits, status, changed)
}
