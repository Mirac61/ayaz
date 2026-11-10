package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// repo makes a repository with one commit: a.txt and sub/b.txt.
func repo(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	root := t.TempDir()
	write(t, filepath.Join(root, "a.txt"), "a\n")
	write(t, filepath.Join(root, "sub", "b.txt"), "b\n")
	gitIn(t, root, "init", "-q", "-b", "main")
	gitIn(t, root, "add", ".")
	gitIn(t, root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init")
	return root
}

func gitIn(t *testing.T, dir string, args ...string) {
	t.Helper()
	if out, err := exec.Command("git", append([]string{"-C", dir}, args...)...).CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func write(t *testing.T, path, s string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(s), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestBranch(t *testing.T) {
	root := repo(t)
	if b, err := Branch(root); err != nil || b != "main" {
		t.Errorf("Branch = %q, %v; want main", b, err)
	}
	gitIn(t, root, "checkout", "-q", "--detach")
	if b, _ := Branch(root); len(b) < 7 {
		t.Errorf("detached Branch = %q, want a short SHA", b)
	}
	if b, err := Branch(t.TempDir()); err != nil || b != "" {
		t.Errorf("Branch outside a repo = %q, %v; want empty", b, err)
	}
}

func TestHead(t *testing.T) {
	root := repo(t)
	write(t, filepath.Join(root, "a.txt"), "changed\n")
	write(t, filepath.Join(root, "new.txt"), "new\n")
	os.Remove(filepath.Join(root, "sub", "b.txt"))
	cases := []struct {
		root, rel, text string
		tracked         bool
	}{
		{root, "a.txt", "a\n", true},
		{root, "new.txt", "", false},
		{root, "sub/b.txt", "b\n", true}, // deleted in the working tree, still at HEAD
		{filepath.Join(root, "sub"), "b.txt", "b\n", true},
		{t.TempDir(), "a.txt", "", false},
	}
	for _, c := range cases {
		text, tracked, err := Head(c.root, c.rel)
		if err != nil || text != c.text || tracked != c.tracked {
			t.Errorf("Head(%s, %s) = %q, %v, %v; want %q, %v", c.root, c.rel, text, tracked, err, c.text, c.tracked)
		}
	}
}

func TestWatch(t *testing.T) {
	root := repo(t)
	hit := make(chan struct{}, 1)
	go Watch(t.Context(), root, func() {
		select {
		case hit <- struct{}{}:
		default:
		}
	})
	time.Sleep(100 * time.Millisecond) // let Watch take its first stamp
	gitIn(t, root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "two")
	select {
	case <-hit:
	case <-time.After(3 * Poll):
		t.Fatal("no change seen after a commit")
	}
}

// M37: a folder that becomes a repository after opening (git init) is picked up without a reopen.
func TestWatchSeesGitInit(t *testing.T) {
	root := t.TempDir()
	hit := make(chan struct{}, 1)
	go Watch(t.Context(), root, func() {
		select {
		case hit <- struct{}{}:
		default:
		}
	})
	time.Sleep(100 * time.Millisecond)
	gitIn(t, root, "init", "-q")
	select {
	case <-hit:
	case <-time.After(3 * Poll):
		t.Fatal("git init not seen")
	}
}

func TestStatus(t *testing.T) {
	root := repo(t)
	write(t, filepath.Join(root, "gone.txt"), "g\n")
	gitIn(t, root, "add", "gone.txt")
	gitIn(t, root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "gone")
	write(t, filepath.Join(root, ".gitignore"), "build/\n*.log\n")
	write(t, filepath.Join(root, "a.txt"), "changed\n")
	write(t, filepath.Join(root, "sub", "new.txt"), "n\n")
	write(t, filepath.Join(root, "staged.txt"), "s\n")
	gitIn(t, root, "add", "staged.txt")
	write(t, filepath.Join(root, "build", "out.bin"), "x")
	write(t, filepath.Join(root, "sub", "x.log"), "x")
	write(t, filepath.Join(root, "fresh", "f.txt"), "f\n")
	gitIn(t, root, "rm", "-q", "gone.txt")

	st, err := Status(root)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"a.txt": "M", "sub/new.txt": "?", "staged.txt": "A", "build": "!", "sub/x.log": "!", "fresh": "?", ".gitignore": "?",
	}
	if len(st) != len(want) {
		t.Errorf("Status = %v, want %v", st, want)
	}
	for p, c := range want {
		if st[p] != c {
			t.Errorf("Status[%q] = %q, want %q", p, st[p], c)
		}
	}

	// A subfolder as the workspace: paths relative to it, nothing from outside.
	sub, _ := Status(filepath.Join(root, "sub"))
	if len(sub) != 2 || sub["new.txt"] != "?" || sub["x.log"] != "!" {
		t.Errorf("Status(sub) = %v", sub)
	}
	if st, err := Status(t.TempDir()); err != nil || len(st) != 0 {
		t.Errorf("Status outside a repo = %v, %v", st, err)
	}
}

func TestLineBlame(t *testing.T) {
	root := repo(t)
	write(t, filepath.Join(root, "a.txt"), "a\nsecond\n")
	gitIn(t, root, "add", ".")
	gitIn(t, root, "-c", "user.name=Ada", "-c", "user.email=ada@x", "commit", "-q", "-m", "add second")

	first, ok, err := LineBlame(root, "a.txt", "", 1)
	if err != nil || !ok || !first.Committed || first.Author != "t" || first.Summary != "init" || len(first.Hash) != 8 {
		t.Fatalf("line 1 = %+v, %v, %v", first, ok, err)
	}
	second, _, _ := LineBlame(root, "a.txt", "", 2)
	if second.Author != "Ada" || second.Summary != "add second" || second.Time == 0 || second.Hash == first.Hash {
		t.Fatalf("line 2 = %+v", second)
	}

	// An unsaved buffer: the changed line isn't committed, the others still are, and the file's own subfolder works.
	edited, ok, err := LineBlame(root, "a.txt", "a\nsecond, edited\n", 2)
	if err != nil || !ok || edited.Committed || edited.Hash != "" {
		t.Fatalf("edited line = %+v, %v, %v", edited, ok, err)
	}
	if kept, _, _ := LineBlame(root, "a.txt", "a\nsecond, edited\n", 1); kept.Author != "t" {
		t.Fatalf("unchanged line = %+v", kept)
	}
	sub, ok, _ := LineBlame(filepath.Join(root, "sub"), "b.txt", "", 1)
	if !ok || sub.Summary != "init" {
		t.Fatalf("in a subfolder = %+v, %v", sub, ok)
	}

	// Not tracked, no such line, no repository: nothing to show, no error.
	write(t, filepath.Join(root, "new.txt"), "x\n")
	if _, ok, err := LineBlame(root, "new.txt", "", 1); ok || err != nil {
		t.Fatalf("untracked: ok=%v err=%v", ok, err)
	}
	if _, ok, _ := LineBlame(root, "a.txt", "", 99); ok {
		t.Fatal("line past the end")
	}
	if _, ok, err := LineBlame(t.TempDir(), "a.txt", "", 1); ok || err != nil {
		t.Fatalf("no repository: ok=%v err=%v", ok, err)
	}
}
