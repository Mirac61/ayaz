package search

import (
	"cmp"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

func write(t testing.TB, root string, files map[string]string) []string {
	var paths []string
	for p, c := range files {
		abs := filepath.Join(root, p)
		os.MkdirAll(filepath.Dir(abs), 0o755)
		if err := os.WriteFile(abs, []byte(c), 0o644); err != nil {
			t.Fatal(err)
		}
		paths = append(paths, p)
	}
	return paths
}

func collect(t *testing.T, root string, paths []string, o Options) []Hit {
	re, err := Compile(o)
	if err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	var out []Hit
	Run(context.Background(), root, paths, re, func(h []Hit) { mu.Lock(); out = append(out, h...); mu.Unlock() })
	slices.SortFunc(out, func(a, b Hit) int {
		return cmp.Or(strings.Compare(a.Path, b.Path), cmp.Compare(a.Line, b.Line), cmp.Compare(a.Col, b.Col))
	})
	return out
}

func TestRun(t *testing.T) {
	root := t.TempDir()
	paths := write(t, root, map[string]string{
		"a.go":       "package a\nfunc Foo() {}\r\nvar foo = 1 // foo\n",
		"sub/b.txt":  "äö foo\n",
		"bin.dat":    "foo\x00bar",
		"emoji.md":   "😀foo",
		"missing.go": "", // deleted below: unreadable files are skipped
	})
	os.Remove(filepath.Join(root, "missing.go"))
	h := func(p string, l, c, n int, text string) Hit { return Hit{p, l, c, n, text} }
	cases := []struct {
		o    Options
		want []Hit
	}{
		// smart case: lower-case query matches Foo too; \r is trimmed
		{Options{Query: "foo"}, []Hit{h("a.go", 2, 5, 3, "func Foo() {}"), h("a.go", 3, 4, 3, "var foo = 1 // foo"), h("a.go", 3, 15, 3, "var foo = 1 // foo"), h("emoji.md", 1, 2, 3, "😀foo"), h("sub/b.txt", 1, 3, 3, "äö foo")}},
		{Options{Query: "Foo"}, []Hit{h("a.go", 2, 5, 3, "func Foo() {}")}},
		{Options{Query: "f.o"}, nil}, // literal: the dot is a dot
		{Options{Query: `f.o\(`, Regex: true}, []Hit{h("a.go", 2, 5, 4, "func Foo() {}")}},
		{Options{Query: "x*", Regex: true}, nil}, // empty matches are dropped
	}
	for _, c := range cases {
		if got := collect(t, root, paths, c.o); !slices.Equal(got, c.want) {
			t.Errorf("%+v:\n got %v\nwant %v", c.o, got, c.want)
		}
	}
	if _, err := Compile(Options{Query: "(", Regex: true}); err == nil {
		t.Error("bad regexp should fail")
	}
}

func TestMaxHitsAndCancel(t *testing.T) {
	root := t.TempDir()
	files := map[string]string{}
	for i := range 50 {
		files[fmt.Sprintf("f%d", i)] = strings.Repeat("x\n", 500)
	}
	paths := write(t, root, files)
	if got := collect(t, root, paths, Options{Query: "x"}); len(got) != MaxHits {
		t.Fatalf("got %d hits, want %d", len(got), MaxHits)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	re, _ := Compile(Options{Query: "x"})
	n := 0
	Run(ctx, root, paths, re, func(h []Hit) { n += len(h) })
	if n >= MaxHits {
		t.Fatalf("cancelled search still found %d", n)
	}
}

// K15: 50,000 files, literal. Run with `go test ./internal/search -run XXX -bench K15 -benchtime 3x`.
func BenchmarkK15(b *testing.B) {
	root := b.TempDir()
	files := map[string]string{}
	body := strings.Repeat("func handler(w http.ResponseWriter, r *http.Request) { return nil }\n", 40)
	for i := range 50_000 {
		files[fmt.Sprintf("d%d/f%d.go", i%500, i)] = body
	}
	files["d7/needle.go"] = body + "theNeedleIsHere\n"
	paths := write(b, root, files)
	re, _ := Compile(Options{Query: "theNeedleIsHere"})
	b.ResetTimer()
	for range b.N {
		t0 := time.Now()
		var first time.Duration
		Run(context.Background(), root, paths, re, func([]Hit) {
			if first == 0 {
				first = time.Since(t0)
			}
		})
		b.ReportMetric(float64(first.Microseconds())/1000, "first-ms")
		b.ReportMetric(float64(time.Since(t0).Microseconds())/1000, "done-ms")
	}
}
