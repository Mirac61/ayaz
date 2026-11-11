package workspace

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// newTestWS builds root/{a.txt, sub/b.go, out -> ../outside, in -> sub} next to an outside folder.
func newTestWS(t testing.TB) *Workspace {
	t.Helper()
	base := t.TempDir()
	root := filepath.Join(base, "root")
	must(t, os.MkdirAll(filepath.Join(root, "sub"), 0o755))
	must(t, os.MkdirAll(filepath.Join(base, "outside"), 0o755))
	must(t, os.WriteFile(filepath.Join(root, "a.txt"), []byte("a"), 0o644))
	must(t, os.WriteFile(filepath.Join(root, "sub", "b.go"), []byte("package b"), 0o644))
	must(t, os.WriteFile(filepath.Join(base, "outside", "secret"), []byte("s"), 0o644))
	must(t, os.Symlink("../outside", filepath.Join(root, "out")))
	must(t, os.Symlink("sub", filepath.Join(root, "in")))
	w, err := New("1", root)
	must(t, err)
	return w
}

func must(t testing.TB, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func TestResolve(t *testing.T) {
	w := newTestWS(t)
	ok := []string{"", ".", "a.txt", "sub/b.go", "sub/../a.txt", "in/b.go", "new.txt", "sub/new.go"}
	for _, rel := range ok {
		if _, err := w.Resolve(rel); err != nil {
			t.Errorf("Resolve(%q) = %v, want ok", rel, err)
		}
	}
	bad := []string{"..", "../outside/secret", "/etc/passwd", "sub/../../outside", "out/secret", "out", "a\x00b"}
	for _, rel := range bad {
		if _, err := w.Resolve(rel); !errors.Is(err, ErrOutside) {
			t.Errorf("Resolve(%q) = %v, want ErrOutside", rel, err)
		}
	}
}

func FuzzResolve(f *testing.F) {
	for _, s := range []string{"a.txt", "..", "out/secret", "sub/../../x", "%2e%2e/x", "in/../out", "/x"} {
		f.Add(s)
	}
	w := newTestWS(f)
	f.Fuzz(func(t *testing.T, rel string) {
		p, err := w.Resolve(rel)
		if err != nil {
			return
		}
		if p != w.Root && !strings.HasPrefix(p, w.Root+string(filepath.Separator)) {
			t.Fatalf("Resolve(%q) = %q escapes %q", rel, p, w.Root)
		}
	})
}

func TestList(t *testing.T) {
	w := newTestWS(t)
	got, err := w.List("")
	must(t, err)
	want := []Entry{{"in", true}, {"out", true}, {"sub", true}, {"a.txt", false}}
	if len(got) != len(want) {
		t.Fatalf("List = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("List = %v, want %v", got, want)
		}
	}
	if _, err := w.List("out"); !errors.Is(err, ErrOutside) {
		t.Fatalf("List(out) = %v, want ErrOutside", err)
	}
}

func TestWriteText(t *testing.T) {
	w := newTestWS(t)
	f, err := w.ReadText("a.txt")
	must(t, err)
	must(t, os.Chmod(filepath.Join(w.Root, "a.txt"), 0o600))
	f, err = w.ReadText("a.txt") // chmod changes ctime only, but read again to be safe
	must(t, err)

	m, err := w.WriteText("a.txt", "new", f.Mtime)
	must(t, err)
	got, _ := os.ReadFile(filepath.Join(w.Root, "a.txt"))
	if string(got) != "new" {
		t.Fatalf("content = %q", got)
	}
	// Windows has no Unix permission bits: files always report 0666.
	if st, _ := os.Stat(filepath.Join(w.Root, "a.txt")); runtime.GOOS != "windows" && st.Mode().Perm() != 0o600 {
		t.Fatalf("perm = %v, want 0600 kept", st.Mode().Perm())
	}
	if ents, _ := os.ReadDir(w.Root); len(ents) != 4 {
		t.Fatalf("temp file left behind: %v", ents)
	}

	// Stale mtime: someone else wrote in between.
	if _, err := w.WriteText("a.txt", "lost", f.Mtime); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale write = %v, want ErrConflict", err)
	}
	if _, err := w.WriteText("a.txt", "again", m); err != nil {
		t.Fatalf("write with fresh mtime: %v", err)
	}

	// New file: expectedMtime 0, and only while it doesn't exist.
	if _, err := w.WriteText("sub/c.go", "package c", 0); err != nil {
		t.Fatal(err)
	}
	if _, err := w.WriteText("sub/c.go", "x", 0); !errors.Is(err, ErrConflict) {
		t.Fatalf("overwrite via new-file write = %v, want ErrConflict", err)
	}
	if _, err := w.WriteText("out/secret", "x", 0); !errors.Is(err, ErrOutside) {
		t.Fatalf("write outside = %v, want ErrOutside", err)
	}
}

func TestRegistry(t *testing.T) {
	r := NewRegistry()
	w, err := r.Open(t.TempDir())
	must(t, err)
	if got, _ := r.Get(w.ID); got != w {
		t.Fatal("Get after Open")
	}
	if _, err := r.Get("nope"); !errors.Is(err, ErrUnknown) {
		t.Fatalf("Get(nope) = %v", err)
	}
	if _, err := r.Open(filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("Open(missing) succeeded")
	}
}

func TestCreateRename(t *testing.T) {
	w := newTestWS(t)
	must(t, w.Create("new/deep/c.txt", false))
	must(t, w.Create("dir", true))
	if st, err := os.Stat(filepath.Join(w.Root, "new", "deep", "c.txt")); err != nil || st.IsDir() {
		t.Fatalf("created file: %v", err)
	}
	if err := w.Create("a.txt", false); !errors.Is(err, fs.ErrExist) {
		t.Errorf("Create over a file = %v, want ErrExist", err)
	}
	must(t, w.Rename("new/deep/c.txt", "dir/d.txt"))
	if _, err := os.Stat(filepath.Join(w.Root, "dir", "d.txt")); err != nil {
		t.Fatal(err)
	}
	if err := w.Rename("dir/d.txt", "a.txt"); err == nil {
		t.Error("Rename onto an existing file succeeded")
	}
	// A symlink is renamed as a link: its target folder stays where it is.
	must(t, w.Rename("in", "in2"))
	if _, err := os.Stat(filepath.Join(w.Root, "sub", "b.go")); err != nil {
		t.Fatalf("renaming a link moved its target: %v", err)
	}
	for _, bad := range []string{"", ".", "..", "../x", "/etc/x", "out/secret", "sub/../../x"} {
		if err := w.Create(bad, false); err == nil {
			t.Errorf("Create(%q) succeeded", bad)
		}
		if err := w.Rename("a.txt", bad); err == nil {
			t.Errorf("Rename to %q succeeded", bad)
		}
		if err := w.Trash(bad); err == nil {
			t.Errorf("Trash(%q) succeeded", bad)
		}
	}
}

func TestReadTextRefusesBinary(t *testing.T) {
	w, err := New("t", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for name, b := range map[string][]byte{"nul.bin": {'a', 0, 'b'}, "latin1.txt": {0xe4, 'x'}} {
		if err := os.WriteFile(filepath.Join(w.Root, name), b, 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := w.ReadText(name); !errors.Is(err, ErrBinary) {
			t.Errorf("%s: got %v, want ErrBinary", name, err)
		}
	}
}

func TestReadPreview(t *testing.T) {
	w, err := New("t", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	write := func(name string, b []byte) {
		if err := os.WriteFile(filepath.Join(w.Root, name), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("small.txt", []byte("abc"))
	write("long.txt", []byte("abcdef"))
	write("umlaut.txt", []byte("abäcd")) // ä is two bytes: a limit of 3 cuts it
	write("nul.bin", []byte{'a', 0, 'b'})
	for _, c := range []struct {
		name string
		max  int
		text string
		more bool
	}{
		{"small.txt", 10, "abc", false}, {"small.txt", 3, "abc", false}, {"long.txt", 3, "abc", true},
		{"umlaut.txt", 3, "ab", true}, {"umlaut.txt", 4, "abä", true},
	} {
		got, err := w.ReadPreview(c.name, c.max)
		if err != nil || got.Text != c.text || got.More != c.more {
			t.Errorf("%s max %d: got %+v, %v; want %q more=%v", c.name, c.max, got, err, c.text, c.more)
		}
	}
	if _, err := w.ReadPreview("nul.bin", 10); !errors.Is(err, ErrBinary) {
		t.Errorf("nul.bin: got %v, want ErrBinary", err)
	}
}
