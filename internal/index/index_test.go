package index

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"testing"
	"unicode"
)

var repo = []string{
	"README.md",
	"Taskfile.yml",
	"main.go",
	"go.mod",
	"app/workspace.go",
	"app/terminal.go",
	"internal/workspace/workspace.go",
	"internal/workspace/workspace_test.go",
	"internal/pty/session.go",
	"internal/index/match.go",
	"docs/05-roadmap.md",
	"docs/adr/0010-command-registry.md",
	"frontend/package.json",
	"frontend/src/App.tsx",
	"frontend/src/core/buffers.ts",
	"frontend/src/core/buffers.test.ts",
	"frontend/src/core/backend.ts",
	"frontend/src/shell/Workbench.tsx",
	"frontend/src/shell/Tree.tsx",
	"frontend/src/shell/shell.css",
	"frontend/src/editor/editor.ts",
	"frontend/src/editor/vim/setup.ts",
	"frontend/src/theme/kanagawa-cm.ts",
	"frontend/src/terminal/terminal.ts",
}

// Golden rankings: query → expected top hit. Add a line whenever a ranking feels wrong in daily use.
func TestGolden(t *testing.T) {
	ix := New(slices.Clone(repo))
	golden := []struct{ q, want string }{
		{"readme", "README.md"},
		{"rdme", "README.md"},
		{"main", "main.go"},
		{"workspace.go", "app/workspace.go"},
		{"iwork", "internal/workspace/workspace.go"},
		{"wstest", "internal/workspace/workspace_test.go"},
		{"buffers", "frontend/src/core/buffers.ts"},
		{"buftest", "frontend/src/core/buffers.test.ts"},
		{"wb", "frontend/src/shell/Workbench.tsx"},
		{"Wb", "frontend/src/shell/Workbench.tsx"},
		{"tree", "frontend/src/shell/Tree.tsx"},
		{"roadmap", "docs/05-roadmap.md"},
		{"vimsetup", "frontend/src/editor/vim/setup.ts"},
		{"vim setup", "frontend/src/editor/vim/setup.ts"},
		{"kcm", "frontend/src/theme/kanagawa-cm.ts"},
		{"term", "app/terminal.go"},
		{"tterm", "frontend/src/terminal/terminal.ts"},
		{"adrcmd", "docs/adr/0010-command-registry.md"},
		{"pkg", "frontend/package.json"},
		{"css", "frontend/src/shell/shell.css"},
	}
	for _, g := range golden {
		got := ix.Find(g.q, 5)
		if len(got) == 0 || got[0].Path != g.want {
			t.Errorf("%q: top %v, want %s", g.q, paths(got), g.want)
		}
	}
}

func paths(ms []Match) []string {
	out := make([]string, len(ms))
	for i, m := range ms {
		out[i] = fmt.Sprintf("%s(%d)", m.Path, m.Score)
	}
	return out
}

func TestFind(t *testing.T) {
	ix := New(slices.Clone(repo))
	if got := ix.Find("zzz", 10); len(got) != 0 {
		t.Errorf("no match: got %v", paths(got))
	}
	if got := ix.Find("", 3); len(got) != 3 || got[0].Path != "README.md" {
		t.Errorf("empty query: got %v", paths(got))
	}
	if got := ix.Find("wb", 100); len(got) > len(repo) {
		t.Errorf("more hits than paths")
	}
	if got := ix.Find("Tree", 10); len(got) != 1 {
		t.Errorf("smart case: got %v", paths(got))
	}
	m := ix.Find("wb", 1)[0]
	if !slices.Equal(m.Positions, []int{19, 23}) { // frontend/src/shell/[W]ork[b]ench.tsx
		t.Errorf("positions %v", m.Positions)
	}
}

// Any query and path: no panic, positions ascending, in range, and on matching runes.
func FuzzFind(f *testing.F) {
	f.Add("a/bC_d.go", "abc")
	f.Add("ÄÖü/straße", "ss")
	f.Add("", "x")
	f.Fuzz(func(t *testing.T, path, q string) {
		ix := New([]string{path})
		for _, m := range ix.Find(q, 5) {
			r := []rune(m.Path)
			for i, p := range m.Positions {
				if p < 0 || p >= len(r) || i > 0 && p <= m.Positions[i-1] {
					t.Fatalf("bad positions %v for %q", m.Positions, m.Path)
				}
				if unicode.ToLower(r[p]) != unicode.ToLower([]rune(stripSpaces(q))[i]) && r[p] != []rune(stripSpaces(q))[i] {
					t.Fatalf("position %d is %q, query %q", p, r[p], q)
				}
			}
		}
	})
}

func stripSpaces(s string) (out string) {
	for _, r := range s {
		if r != ' ' {
			out += string(r)
		}
	}
	return
}

func TestBuildWalk(t *testing.T) {
	root := t.TempDir()
	for _, p := range []string{"a.go", "src/b.ts", "node_modules/x/y.js", ".git/HEAD", "dist/out.js"} {
		write(t, filepath.Join(root, p))
	}
	ix, err := Build(root, false)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(ix.paths, []string{"a.go", "src/b.ts"}) {
		t.Errorf("walk: %v", ix.paths)
	}
	ix, _ = Build(root, true)
	if !slices.Equal(ix.paths, []string{"a.go", "dist/out.js", "node_modules/x/y.js", "src/b.ts"}) {
		t.Errorf("walk all: %v", ix.paths)
	}
}

func TestBuildGit(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("no git")
	}
	root := t.TempDir()
	if out, err := exec.Command("git", "init", "-q", root).CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	for _, p := range []string{".gitignore", "a.go", "gen/out.txt", "dist/keep.js"} {
		write(t, filepath.Join(root, p))
	}
	must(t, os.WriteFile(filepath.Join(root, ".gitignore"), []byte("gen/\n"), 0o644))
	ix, _ := Build(root, false)
	// Git decides here: dist/ is not in .gitignore, so it shows up even though the walk would skip it.
	if !slices.Equal(ix.paths, []string{".gitignore", "a.go", "dist/keep.js"}) {
		t.Errorf("git: %v", ix.paths)
	}
}

func write(t testing.TB, p string) {
	must(t, os.MkdirAll(filepath.Dir(p), 0o755))
	must(t, os.WriteFile(p, []byte("x"), 0o644))
}

func must(t testing.TB, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// 50,000 paths shaped like a real repo (K9: ≤ 30 ms per keystroke).
func bigRepo() []string {
	dirs := []string{"src", "internal", "pkg", "cmd", "frontend/src/components", "vendor/github.com/foo"}
	names := []string{"handler", "workspace", "matcher", "session", "config", "Router", "index", "buffer_store"}
	exts := []string{".go", ".ts", ".tsx", "_test.go", ".md"}
	out := make([]string, 0, 50000)
	for i := 0; len(out) < 50000; i++ {
		// about 10 files per folder, like a real repo
		out = append(out, fmt.Sprintf("%s/mod%03d/sub%d/%s%d%s", dirs[i%len(dirs)], i/60, i/10%6, names[i%len(names)], i, exts[i%len(exts)]))
	}
	return out
}

func BenchmarkFind(b *testing.B) {
	ix := New(bigRepo())
	for _, q := range []string{"w", "work", "cmdrouter", "pkgmatcher", "zzz"} {
		b.Run(q, func(b *testing.B) {
			for b.Loop() {
				ix.Find(q, 50)
			}
		})
	}
}

// K10: build the index for 50,000 files, warm FS cache (≤ 1 s).
func BenchmarkBuildWalk(b *testing.B) {
	root := b.TempDir()
	for _, p := range bigRepo() {
		write(b, filepath.Join(root, p))
	}
	for b.Loop() {
		if _, err := Build(root, true); err != nil {
			b.Fatal(err)
		}
	}
}
