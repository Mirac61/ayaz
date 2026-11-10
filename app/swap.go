package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Swap is the unsaved text of one buffer (hot exit, M49): written every few seconds while the buffer is dirty,
// offered back when the folder opens again, removed once the buffer is clean.
type Swap struct {
	Path string `json:"path"`
	Text string `json:"text"`
}

// swapDir is the folder's own place in the user cache, never inside the project.
func swapDir(root string) (string, error) {
	dir := os.Getenv("AYAZ_CACHE_DIR")
	if dir == "" {
		c, err := os.UserCacheDir()
		if err != nil {
			return "", err
		}
		dir = filepath.Join(c, "ayaz")
	}
	return filepath.Join(dir, "swap", hashName(root)), nil
}

func hashName(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:12])
}

// The file name is a hash of the path, so deep paths fit and no path can leave the folder.
func swapFile(root, path string) (string, error) {
	dir, err := swapDir(root)
	return filepath.Join(dir, hashName(path)+".json"), err
}

func writeSwap(root, path, text string) error {
	file, err := swapFile(root, path)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(file), 0o700); err != nil {
		return err
	}
	b, err := json.Marshal(Swap{Path: path, Text: text})
	if err != nil {
		return err
	}
	// Through a temp file: a crash mid-write must not leave half a swap in place of a whole one.
	tmp, err := os.CreateTemp(filepath.Dir(file), ".swap-*")
	if err != nil {
		return err
	}
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmp.Name())
		return err
	}
	return os.Rename(tmp.Name(), file)
}

func removeSwap(root, path string) error {
	file, err := swapFile(root, path)
	if err != nil {
		return err
	}
	if err := os.Remove(file); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}

// readSwaps skips files it can't parse: a broken swap is no reason to refuse the others.
func readSwaps(root string) ([]Swap, error) {
	dir, err := swapDir(root)
	if err != nil {
		return nil, err
	}
	names, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Swap
	for _, n := range names {
		if !strings.HasSuffix(n.Name(), ".json") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, n.Name()))
		var s Swap
		if err != nil || json.Unmarshal(b, &s) != nil || s.Path == "" {
			continue
		}
		out = append(out, s)
	}
	return out, nil
}

// SwapWrite keeps path's unsaved text; path is workspace-relative.
func (s *WorkspaceService) SwapWrite(ws, path, text string) error {
	w, err := s.reg.Get(ws)
	if err != nil {
		return err
	}
	if _, err := w.Resolve(path); err != nil {
		return err
	}
	return writeSwap(w.Root, path, text)
}

// SwapRemove drops path's swap after :w, a discard, or undo back to the saved text. No swap is fine.
func (s *WorkspaceService) SwapRemove(ws, path string) error {
	w, err := s.reg.Get(ws)
	if err != nil {
		return err
	}
	return removeSwap(w.Root, path)
}

// Swaps lists the unsaved texts a previous run of this folder left behind.
func (s *WorkspaceService) Swaps(ws string) ([]Swap, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return nil, err
	}
	return readSwaps(w.Root)
}
