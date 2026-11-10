package app

import (
	"cmp"
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"
)

// Local history (M50): every save keeps the text it replaced, in the user cache, per file.
const (
	historyKeep    = 30      // versions per file, oldest go first
	historyMaxSize = 1 << 20 // bigger files keep no history
)

// Version is one kept text of a file; Time is when it was replaced, in Unix milliseconds.
type Version struct {
	Time int64 `json:"time"`
	Size int   `json:"size"`
}

func historyDir(root, path string) (string, error) {
	dir, err := cacheDir("history", root)
	return filepath.Join(dir, hashName(path)), err
}

// keepVersion stores text as the version of path replaced at t, and drops the oldest beyond historyKeep.
func keepVersion(root, path, text string, t time.Time) error {
	if len(text) > historyMaxSize {
		return nil
	}
	dir, err := historyDir(root, path)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	if err := writeAtomic(filepath.Join(dir, strconv.FormatInt(t.UnixMilli(), 10)+".txt"), []byte(text)); err != nil {
		return err
	}
	vs, err := versions(root, path)
	if err != nil {
		return err
	}
	for _, v := range vs[min(len(vs), historyKeep):] {
		if err := os.Remove(filepath.Join(dir, strconv.FormatInt(v.Time, 10)+".txt")); err != nil {
			return err
		}
	}
	return nil
}

// versions lists path's kept texts, newest first.
func versions(root, path string) ([]Version, error) {
	dir, err := historyDir(root, path)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Version
	for _, e := range entries {
		ms, err := strconv.ParseInt(strings.TrimSuffix(e.Name(), ".txt"), 10, 64)
		info, ierr := e.Info()
		if err != nil || ierr != nil || !strings.HasSuffix(e.Name(), ".txt") {
			continue // temp files, strays
		}
		out = append(out, Version{Time: ms, Size: int(info.Size())})
	}
	slices.SortFunc(out, func(a, b Version) int { return cmp.Compare(b.Time, a.Time) })
	return out, nil
}

func versionText(root, path string, t int64) (string, error) {
	dir, err := historyDir(root, path)
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(filepath.Join(dir, strconv.FormatInt(t, 10)+".txt"))
	return string(b), err
}

// History lists the kept versions of path, newest first.
func (s *WorkspaceService) History(ws, path string) ([]Version, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return nil, err
	}
	return versions(w.Root, path)
}

// HistoryText is the text of path's version from History.
func (s *WorkspaceService) HistoryText(ws, path string, time int64) (string, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return "", err
	}
	return versionText(w.Root, path, time)
}

// keepOld runs after a save: the text that was on disk before becomes a version. A failure only costs history.
func keepOld(root, path, old, saved string) {
	if old == saved {
		return
	}
	if err := keepVersion(root, path, old, time.Now()); err != nil {
		log.Printf("history of %s: %v", path, err)
	}
}
