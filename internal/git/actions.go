package git

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// FileStatus describes the status of a single file in the repository.
type FileStatus struct {
	Path     string `json:"path"`     // relative to workspace root with "/"
	Status   string `json:"status"`   // "M", "A", "D", "?", "U", "R"
	Staged   bool   `json:"staged"`   // true if changes are staged in the index
	Unstaged bool   `json:"unstaged"` // true if working tree has changes or is untracked
}

// StatusDetailed returns each changed, untracked, or conflicted file with staged/unstaged breakdown.
func StatusDetailed(root string) ([]FileStatus, error) {
	out, ok, err := run(root, "rev-parse", "--show-prefix")
	if !ok {
		return nil, err
	}
	prefix := strings.TrimSpace(string(out))

	out, ok, err = run(root, "--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".")
	if !ok {
		return nil, err
	}

	var results []FileStatus
	fields := strings.Split(string(out), "\x00")
	for i := 0; i < len(fields); i++ {
		f := fields[i]
		if len(f) < 4 {
			continue
		}
		x, y, path := f[0], f[1], f[3:]
		if x == 'R' || x == 'C' {
			i++ // next field is the old path
		}
		rel, inside := strings.CutPrefix(strings.TrimSuffix(path, "/"), prefix)
		if !inside || rel == "" {
			continue
		}

		// Ignored files are skipped in detailed status
		if x == '!' {
			continue
		}

		isUntracked := x == '?' && y == '?'
		isConflicted := x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D')
		isStaged := !isUntracked && x != ' ' && x != '?'
		isUnstaged := isUntracked || (y != ' ' && y != '?')

		status := "M"
		switch {
		case isConflicted:
			status = "U"
		case isUntracked:
			status = "?"
		case x == 'D' || y == 'D':
			status = "D"
		case x == 'A' || y == 'A':
			status = "A"
		case x == 'R' || y == 'R':
			status = "R"
		}

		results = append(results, FileStatus{
			Path:     filepath.ToSlash(rel),
			Status:   status,
			Staged:   isStaged,
			Unstaged: isUnstaged,
		})
	}

	return results, nil
}

// StageFile stages path in the git index.
func StageFile(root, rel string) error {
	p := filepath.ToSlash(rel)
	_, ok, err := run(root, "add", "-A", "--", p)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("git add %q failed", p)
	}
	return nil
}

// UnstageFile removes path's staged changes from the git index.
func UnstageFile(root, rel string) error {
	p := filepath.ToSlash(rel)
	_, ok, err := run(root, "restore", "--staged", "--", p)
	if err == nil && ok {
		return nil
	}
	_, ok, err = run(root, "reset", "HEAD", "--", p)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("git unstage %q failed", p)
	}
	return nil
}

// DiscardFile restores the file at rel to HEAD (or deletes it if untracked).
func DiscardFile(root, rel string) error {
	p := filepath.ToSlash(rel)
	// Check if file is untracked
	st, err := StatusDetailed(root)
	if err == nil {
		for _, s := range st {
			if s.Path == p && s.Status == "?" {
				full := filepath.Join(root, filepath.FromSlash(rel))
				return os.RemoveAll(full)
			}
		}
	}

	// Tracked file: restore both staged and working tree to HEAD
	_, ok, err := run(root, "restore", "--staged", "--worktree", "--", p)
	if err == nil && ok {
		return nil
	}
	_, ok, err = run(root, "checkout", "HEAD", "--", p)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("git discard %q failed", p)
	}
	return nil
}

// StageAll stages all changes in root.
func StageAll(root string) error {
	_, ok, err := run(root, "add", "-A", ".")
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("git add -A failed")
	}
	return nil
}

// UnstageAll unstages all staged changes in root.
func UnstageAll(root string) error {
	_, ok, err := run(root, "restore", "--staged", ".")
	if err == nil && ok {
		return nil
	}
	_, ok, err = run(root, "reset", "HEAD")
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("git reset HEAD failed")
	}
	return nil
}

// Commit creates a new git commit with message from staged changes.
func Commit(root, msg string) error {
	m := strings.TrimSpace(msg)
	if m == "" {
		return fmt.Errorf("commit message cannot be empty")
	}
	out, ok, err := run(root, "commit", "-m", m)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("git commit failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}
