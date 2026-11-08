package watch

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Mirac61/ayaz/internal/workspace"
)

func start(t *testing.T) (string, <-chan Batch) {
	root, err := filepath.EvalSymlinks(t.TempDir()) // macOS: /var → /private/var, events use the real path
	if err != nil {
		t.Fatal(err)
	}
	os.MkdirAll(filepath.Join(root, ".git"), 0o755)
	os.WriteFile(filepath.Join(root, "a.txt"), []byte("a"), 0o644)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	ch := make(chan Batch, 16)
	if err := Start(ctx, root, func(b Batch) { ch <- b }); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond) // FSEvents may still report the setup writes; let them pass
	for len(ch) > 0 {
		<-ch
	}
	return root, ch
}

// next waits for a batch that contains path, failing after the K11 budget.
func next(t *testing.T, ch <-chan Batch, path string) Batch {
	t.Helper()
	deadline := time.After(500 * time.Millisecond)
	for {
		select {
		case b := <-ch:
			if slices.Contains(b.Paths, path) {
				return b
			}
		case <-deadline:
			t.Fatalf("no event for %q within 500 ms", path)
		}
	}
}

func TestCreateChangeRemoveRename(t *testing.T) {
	root, ch := start(t)
	p := func(s string) string { return filepath.Join(root, s) }

	os.WriteFile(p("new.txt"), []byte("x"), 0o644)
	next(t, ch, "new.txt")
	os.WriteFile(p("a.txt"), []byte("changed"), 0o644)
	next(t, ch, "a.txt")
	os.Mkdir(p("dir"), 0o755)
	os.WriteFile(p("dir/.hidden"), []byte("x"), 0o644)
	next(t, ch, "dir/.hidden")
	os.Rename(p("new.txt"), p("dir/moved.txt"))
	next(t, ch, "dir/moved.txt")
	os.Remove(p("a.txt"))
	next(t, ch, "a.txt")
}

func TestIgnoresGitAndTempFiles(t *testing.T) {
	root, ch := start(t)
	os.WriteFile(filepath.Join(root, ".git", "HEAD"), []byte("x"), 0o644)
	os.WriteFile(filepath.Join(root, ".a.txt.ayaz-1"), []byte("x"), 0o644)
	os.WriteFile(filepath.Join(root, "marker"), []byte("x"), 0o644)
	b := next(t, ch, "marker")
	for _, p := range b.Paths {
		if p != "marker" {
			t.Errorf("unexpected path %q", p)
		}
	}
}

// Our atomic save (temp + rename) shows up as exactly one changed path.
func TestAtomicSaveIsOneChange(t *testing.T) {
	root, ch := start(t)
	w, err := workspace.New("1", root)
	if err != nil {
		t.Fatal(err)
	}
	f, _ := w.ReadText("a.txt")
	if _, err := w.WriteText("a.txt", "new", f.Mtime); err != nil {
		t.Fatal(err)
	}
	if b := next(t, ch, "a.txt"); len(b.Paths) != 1 {
		t.Errorf("paths = %v, want only a.txt", b.Paths)
	}
}

// The M3 done criterion: `git checkout` swaps files; every swapped file is reported, .git itself is not.
func TestGitCheckout(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git missing")
	}
	root, ch := start(t)
	git := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", root, "-c", "user.name=t", "-c", "user.email=t@t"}, args...)...)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	os.RemoveAll(filepath.Join(root, ".git"))
	git("init", "-q", "-b", "main")
	git("add", ".")
	git("commit", "-qm", "one")
	git("checkout", "-qb", "other")
	os.WriteFile(filepath.Join(root, "a.txt"), []byte("other"), 0o644)
	os.WriteFile(filepath.Join(root, "b.txt"), []byte("b"), 0o644)
	git("add", ".")
	git("commit", "-qm", "two")
	time.Sleep(200 * time.Millisecond)
	for len(ch) > 0 {
		<-ch
	}

	git("checkout", "-q", "main") // a.txt changes, b.txt goes away
	got := map[string]bool{}
	deadline := time.After(500 * time.Millisecond)
	for !got["a.txt"] || !got["b.txt"] {
		select {
		case b := <-ch:
			for _, p := range b.Paths {
				if strings.HasPrefix(p, ".git") {
					t.Errorf("unexpected path %q", p)
				}
				got[p] = true
			}
		case <-deadline:
			t.Fatalf("got %v within 500 ms, want a.txt and b.txt", got)
		}
	}
}
