// Package index lists a workspace's files and fuzzy-matches paths against a query (ADR-0007).
package index

import (
	"bytes"
	"io/fs"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"unicode"
)

// Skipped when walking outside Git, or with all=true (then only .git) (Q26).
var skipDirs = map[string]bool{
	".git": true, "node_modules": true, "dist": true, "build": true, "target": true,
	".cache": true, ".venv": true, "__pycache__": true, ".idea": true,
}

type Index struct {
	paths []string // workspace-relative with "/", sorted
	lower []string // paths lowercased rune by rune, same rune count
}

// Build lists the files under root: in a Git repo what Git doesn't ignore, otherwise a walk
// that skips skipDirs. all=true lists ignored files too and only skips .git.
func Build(root string, all bool) (*Index, error) {
	var paths []string
	if !all {
		paths = gitFiles(root)
	}
	if paths == nil {
		var err error
		if paths, err = walk(root, all); err != nil {
			return nil, err
		}
	}
	return New(paths), nil
}

func New(paths []string) *Index {
	sort.Strings(paths)
	lower := make([]string, len(paths))
	for i, p := range paths {
		lower[i] = strings.Map(unicode.ToLower, p)
	}
	return &Index{paths: paths, lower: lower}
}

func (ix *Index) Len() int { return len(ix.paths) }

// gitFiles returns nil if root is not inside a Git work tree or git is missing.
// shortcut: tracked files deleted from disk still show up until M3 rebuilds the index on changes.
func gitFiles(root string) []string {
	out, err := exec.Command("git", "-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard").Output()
	if err != nil {
		return nil
	}
	paths := []string{}
	seen := map[string]bool{} // --cached lists a file once per merge stage during conflicts
	for p := range bytes.SplitSeq(out, []byte{0}) {
		if s := string(p); s != "" && !seen[s] {
			seen[s] = true
			paths = append(paths, s)
		}
	}
	return paths
}

// walk doesn't follow symlinked folders, so it stays inside root.
func walk(root string, all bool) ([]string, error) {
	paths := []string{}
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // unreadable folder: skip it, keep the rest
		}
		if d.IsDir() {
			if p != root && (d.Name() == ".git" || !all && skipDirs[d.Name()]) {
				return filepath.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		paths = append(paths, filepath.ToSlash(rel))
		return nil
	})
	return paths, err
}
