package git

import (
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestWebURL(t *testing.T) {
	const want = "https://github.com/me/proj/blob/main/src/a.go#L42"
	for _, remote := range []string{
		"git@github.com:me/proj.git",
		"git@github.com:me/proj",
		"ssh://git@github.com/me/proj.git",
		"ssh://git@github.com:2222/me/proj",
		"https://github.com/me/proj.git",
		"https://github.com/me/proj",
		"https://ghp_secret123@github.com/me/proj.git",
		"https://user:pw@github.com/me/proj",
	} {
		got, err := webURL(remote, "main", "src/a.go", 42)
		if err != nil || got != want {
			t.Errorf("webURL(%q) = %q, %v; want %q", remote, got, err, want)
		}
	}
	if got, _ := webURL("git@github.com:me/proj.git", "main", "a b/c#d.go", 0); got != "https://github.com/me/proj/blob/main/a%20b/c%23d.go" {
		t.Errorf("encoding / no anchor: %q", got)
	}
	if got, _ := webURL("git@github.com:me/proj.git", "feat/x", "a.go", 1); got != "https://github.com/me/proj/blob/feat/x/a.go#L1" {
		t.Errorf("a branch with a slash: %q", got)
	}
	for _, remote := range []string{"/srv/git/proj.git", "https://ghp_secret123@github.com/", "ftp://ghp_secret123@host/a/b", ""} {
		_, err := webURL(remote, "main", "a.go", 1)
		if err == nil {
			t.Errorf("webURL(%q) succeeded", remote)
		} else if strings.Contains(err.Error(), "secret") {
			t.Errorf("the error leaks the token: %v", err)
		}
	}
}

func TestBrowseURL(t *testing.T) {
	root := repo(t)
	if _, err := BrowseURL(root, "a.txt", 1, false); err == nil || !strings.Contains(err.Error(), "no remote named origin") {
		t.Errorf("without origin: %v", err)
	}
	gitIn(t, root, "remote", "add", "origin", "git@github.com:me/proj.git")

	got, err := BrowseURL(root, "a.txt", 3, false)
	if err != nil || got != "https://github.com/me/proj/blob/main/a.txt#L3" {
		t.Errorf("branch link = %q, %v", got, err)
	}
	got, err = BrowseURL(root, "a.txt", 3, true)
	if m := regexp.MustCompile(`^https://github.com/me/proj/blob/[0-9a-f]{40}/a.txt#L3$`); err != nil || !m.MatchString(got) {
		t.Errorf("permalink = %q, %v", got, err)
	}

	// A workspace that is a subfolder of the repository still links the file's path from the repository root.
	got, err = BrowseURL(filepath.Join(root, "sub"), "b.txt", 0, false)
	if err != nil || got != "https://github.com/me/proj/blob/main/sub/b.txt" {
		t.Errorf("subfolder link = %q, %v", got, err)
	}
}
