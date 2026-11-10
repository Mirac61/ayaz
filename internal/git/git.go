// Package git asks the git program about a workspace: its branch and a file's text at HEAD. No library, so the
// user's git config (worktrees, safe.directory) applies as on the command line.
package git

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// run runs git in dir. A non-zero exit (not a repo, no such path) is ok=false; a missing git binary is an error.
func run(dir string, args ...string) (out []byte, ok bool, err error) {
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	err = cmd.Run()
	if _, exit := errors.AsType[*exec.ExitError](err); exit {
		return nil, false, nil
	}
	return stdout.Bytes(), err == nil, err
}

// Branch is HEAD's branch, the short SHA when detached, "" outside a repository.
func Branch(root string) (string, error) {
	out, ok, err := run(root, "symbolic-ref", "--short", "-q", "HEAD")
	if err != nil || ok {
		return strings.TrimSpace(string(out)), err
	}
	out, _, err = run(root, "rev-parse", "--short", "HEAD")
	return strings.TrimSpace(string(out)), err
}

// Head is the file's text at HEAD; rel is relative to root, which may be a subfolder of the repository.
// tracked=false: the file is new, untracked, or root is no repository.
func Head(root, rel string) (text string, tracked bool, err error) {
	// "HEAD:./x" is relative to -C, so a subfolder needs no prefix.
	out, ok, err := run(root, "show", "HEAD:./"+filepath.ToSlash(rel))
	return string(out), ok, err
}

// Poll is how often Watch looks at the repository's HEAD, index and reflog.
const Poll = time.Second

// Watch calls fn when HEAD, the index or the reflog change, until ctx is cancelled. The file watcher skips .git/,
// and a commit from lazygit changes no working file, so this is how the gutter and branch learn about it.
// shortcut: the git dir is looked up once, a `git init` after opening the folder needs a reopen.
func Watch(ctx context.Context, root string, fn func()) {
	out, ok, _ := run(root, "rev-parse", "--absolute-git-dir")
	if !ok {
		return
	}
	dir := strings.TrimSpace(string(out))
	files := []string{"HEAD", "index", filepath.Join("logs", "HEAD")}
	stamp := func() string {
		var b strings.Builder
		for _, f := range files {
			if fi, err := os.Stat(filepath.Join(dir, f)); err == nil {
				fmt.Fprint(&b, fi.ModTime().UnixNano(), fi.Size())
			}
			b.WriteByte(0)
		}
		return b.String()
	}
	last := stamp()
	t := time.NewTicker(Poll)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if s := stamp(); s != last {
				last = s
				fn()
			}
		}
	}
}

// Status is the working tree's state per path below root, relative to root with "/": "M" changed (staged or not),
// "A" added, "?" untracked, "!" ignored, "U" conflict. A folder that is untracked or ignored as a whole comes as
// one entry without the trailing "/". Deleted files are left out (the tree can't show them). Empty outside a repository.
func Status(root string) (map[string]string, error) {
	out, ok, err := run(root, "rev-parse", "--show-prefix")
	if !ok {
		return map[string]string{}, err
	}
	prefix := strings.TrimSpace(string(out))
	// No optional locks: status would otherwise refresh the index under index.lock, and a git add or commit
	// in the terminal at the same moment fails ("Another git process seems to be running").
	out, ok, err = run(root, "--no-optional-locks", "status", "--porcelain=v1", "-z", "--ignored=matching", "--untracked-files=normal", "--", ".")
	if !ok {
		return map[string]string{}, err
	}
	st := map[string]string{}
	fields := strings.Split(string(out), "\x00")
	for i := 0; i < len(fields); i++ {
		f := fields[i]
		if len(f) < 4 {
			continue
		}
		x, y, path := f[0], f[1], f[3:]
		if x == 'R' || x == 'C' {
			i++ // the next field is the old path
		}
		// Porcelain paths are relative to the repository, whatever -C says.
		rel, inside := strings.CutPrefix(strings.TrimSuffix(path, "/"), prefix)
		if !inside || rel == "" {
			continue
		}
		switch {
		case x == '!':
			st[rel] = "!"
		case x == '?':
			st[rel] = "?"
		case x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D'):
			st[rel] = "U"
		case y == 'D' || (x == 'D' && y == ' '):
			// deleted: not in the tree
		case x == 'A' || x == 'R' || x == 'C':
			st[rel] = "A"
		default:
			st[rel] = "M"
		}
	}
	return st, nil
}
