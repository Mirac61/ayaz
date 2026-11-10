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
