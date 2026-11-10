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
