package git

import (
	"bytes"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// Index is the file's text in the index (what is staged), tracked=false when it isn't in the index.
func Index(root, rel string) (text string, tracked bool, err error) {
	out, ok, err := run(root, "show", ":./"+filepath.ToSlash(rel)) // ":./x" is relative to -C, like Head's
	return string(out), ok, err
}

// ApplyHunk stages (or, with reverse, unstages) one hunk of the file at rel in the index; the working tree isn't
// touched. hunk is "@@ -a,b +c,d @@" and its lines without context, written against the index (the staged side)
// or, for reverse, the way the index looks now.
func ApplyHunk(root, rel, hunk string, reverse bool) error {
	prefix, ok, err := run(root, "rev-parse", "--show-prefix") // the patch's paths start at the repository's top
	if err != nil || !ok {
		return fmt.Errorf("not a git repository")
	}
	path := strings.TrimSpace(string(prefix)) + filepath.ToSlash(rel)
	patch := fmt.Sprintf("diff --git a/%s b/%s\n--- a/%s\n+++ b/%s\n%s", path, path, path, path, hunk)
	args := []string{"-C", root, "apply", "--cached", "--unidiff-zero", "--whitespace=nowarn"}
	if reverse {
		args = append(args, "--reverse")
	}
	cmd := exec.Command("git", append(args, "-")...)
	cmd.Stdin = strings.NewReader(patch)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if _, exit := errors.AsType[*exec.ExitError](err); exit {
			return fmt.Errorf("git apply: %s", strings.TrimSpace(stderr.String()))
		}
		return err
	}
	return nil
}
