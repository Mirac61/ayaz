package git

import (
	"path/filepath"
	"strconv"
	"strings"
)

// Blame is who last changed one line, and in which commit.
type Blame struct {
	Hash      string `json:"hash"` // short; "" for a line that isn't committed yet
	Author    string `json:"author"`
	Time      int64  `json:"time"` // unix seconds of the commit
	Summary   string `json:"summary"`
	Committed bool   `json:"committed"`
}

// LineBlame blames line (1-based) of the file at rel. With text, that is blamed instead of the file on disk, so a
// buffer with unsaved changes gets "not committed" for the lines that changed. ok=false: not a repository, or the
// file isn't tracked.
func LineBlame(root, rel, text string, line int) (b Blame, ok bool, err error) {
	args := []string{"blame", "--porcelain", "-L", strconv.Itoa(line) + "," + strconv.Itoa(line)}
	if text != "" {
		args = append(args, "--contents", "-")
	}
	out, ok, err := runStdin(root, text, append(args, "--", filepath.ToSlash(rel))...)
	if err != nil || !ok {
		return Blame{}, false, err
	}
	return parseBlame(string(out)), true, nil
}

// parseBlame reads --porcelain output for one line: "<hash> <orig> <final> <n>", then "key value" lines, then the
// source line after a tab.
func parseBlame(out string) Blame {
	var b Blame
	for i, l := range strings.Split(out, "\n") {
		switch {
		case i == 0:
			b.Hash, _, _ = strings.Cut(l, " ")
		case strings.HasPrefix(l, "author "):
			b.Author = l[len("author "):]
		case strings.HasPrefix(l, "author-time "):
			b.Time, _ = strconv.ParseInt(l[len("author-time "):], 10, 64)
		case strings.HasPrefix(l, "summary "):
			b.Summary = l[len("summary "):]
		case strings.HasPrefix(l, "\t"):
			if b.Committed = strings.Trim(b.Hash, "0") != ""; b.Committed {
				b.Hash = b.Hash[:min(len(b.Hash), 8)]
			} else {
				b.Hash = ""
			}
			return b
		}
	}
	return b
}
