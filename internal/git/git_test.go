package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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
	gitIn(t, root, "config", "user.name", "t")
	gitIn(t, root, "config", "user.email", "t@t")
	gitIn(t, root, "add", ".")
	gitIn(t, root, "commit", "-q", "-m", "init")
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

func TestApplyHunkStagesAndUnstages(t *testing.T) {
	root := repo(t)
	write(t, filepath.Join(root, "a.txt"), "a\n")
	write(t, filepath.Join(root, "sub", "b.txt"), "b1\nb2\nb3\n")
	gitIn(t, root, "add", ".")
	gitIn(t, root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "three lines")

	staged := func(dir string) string {
		out, err := exec.Command("git", "-C", dir, "diff", "--cached", "-U0").Output()
		if err != nil {
			t.Fatal(err)
		}
		return string(out)
	}
	// Stage "b2 → B2" from the subfolder (the patch's path must start at the repository's top).
	sub := filepath.Join(root, "sub")
	hunk := "@@ -2 +2 @@\n-b2\n+B2\n"
	if err := ApplyHunk(sub, "b.txt", hunk, false); err != nil {
		t.Fatal(err)
	}
	if got := staged(root); !contains(got, "-b2\n+B2\n") || contains(got, "\n-b1") || contains(got, "\n+b1") {
		t.Fatalf("staged:\n%s", got)
	}
	if idx, ok, _ := Index(sub, "b.txt"); !ok || idx != "b1\nB2\nb3\n" {
		t.Fatalf("Index = %q, %v", idx, ok)
	}
	// An insertion and a deletion, zero context: "-N,0" is after line N.
	if err := ApplyHunk(sub, "b.txt", "@@ -3,0 +4 @@\n+b4\n", false); err != nil {
		t.Fatal(err)
	}
	if err := ApplyHunk(sub, "b.txt", "@@ -1 +0,0 @@\n-b1\n", false); err != nil {
		t.Fatal(err)
	}
	if idx, _, _ := Index(sub, "b.txt"); idx != "B2\nb3\nb4\n" {
		t.Fatalf("Index after insert and delete = %q", idx)
	}
	// Unstage the first change: the patch is written the way the index looks now (reverse).
	if err := ApplyHunk(sub, "b.txt", "@@ -1 +1 @@\n-b2\n+B2\n", true); err != nil {
		t.Fatalf("unstage: %v", err)
	}
	if idx, _, _ := Index(sub, "b.txt"); idx != "b2\nb3\nb4\n" {
		t.Fatalf("Index after unstage = %q", idx)
	}
	if b, _ := os.ReadFile(filepath.Join(sub, "b.txt")); string(b) != "b1\nb2\nb3\n" {
		t.Fatalf("the working file changed: %q", b) // the index only
	}
	// A hunk that doesn't fit says why and changes nothing.
	if err := ApplyHunk(sub, "b.txt", "@@ -1 +1 @@\n-nope\n+x\n", false); err == nil {
		t.Fatal("a hunk that doesn't match was accepted")
	}
	if _, ok, _ := Index(sub, "missing.txt"); ok {
		t.Fatal("Index of a file that isn't there")
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }
