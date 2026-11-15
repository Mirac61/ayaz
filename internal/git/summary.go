package git

import (
	"strconv"
	"strings"
)

// Summary is what the start page shows about a recent folder.
type Summary struct {
	Repo    bool     `json:"repo"` // false: no git repository
	Branch  string   `json:"branch"`
	Ahead   int      `json:"ahead"`
	Behind  int      `json:"behind"`
	Changed []string `json:"changed"` // changed and untracked paths, relative to the repository
}

// Summarize reads branch, upstream distance and changed paths with one git call and no index lock.
func Summarize(root string) (Summary, error) {
	out, ok, err := run(root, "--no-optional-locks", "status", "--porcelain=v1", "-b", "-z", "--untracked-files=normal")
	if !ok {
		return Summary{Changed: []string{}}, err
	}
	s := Summary{Repo: true, Changed: []string{}}
	fields := strings.Split(string(out), "\x00")
	for i, f := range fields {
		if i == 0 {
			s.Branch, s.Ahead, s.Behind = parseHeader(strings.TrimPrefix(f, "## "))
			continue
		}
		if len(f) < 4 {
			continue
		}
		s.Changed = append(s.Changed, f[3:])
		if f[0] == 'R' || f[0] == 'C' {
			fields[i+1] = "" // the next field is the old path
		}
	}
	return s, nil
}

// parseHeader reads "main...origin/main [ahead 2, behind 1]", "main", "HEAD (no branch)" or "No commits yet on main".
func parseHeader(h string) (branch string, ahead, behind int) {
	if rest, ok := strings.CutPrefix(h, "No commits yet on "); ok {
		return rest, 0, 0
	}
	if strings.HasPrefix(h, "HEAD (no branch)") {
		return "", 0, 0
	}
	h, counts, _ := strings.Cut(h, " [")
	branch, _, _ = strings.Cut(h, "...")
	for _, part := range strings.Split(strings.TrimSuffix(counts, "]"), ", ") {
		if n, ok := strings.CutPrefix(part, "ahead "); ok {
			ahead, _ = strconv.Atoi(n)
		} else if n, ok := strings.CutPrefix(part, "behind "); ok {
			behind, _ = strconv.Atoi(n)
		}
	}
	return branch, ahead, behind
}
