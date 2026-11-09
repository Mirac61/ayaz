// Package workspace is the only way to touch files: every path from the frontend goes through Resolve.
package workspace

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
)

var (
	ErrOutside  = errors.New("path outside workspace")
	ErrConflict = errors.New("file changed on disk")
	ErrUnknown  = errors.New("unknown workspace")
)

type Workspace struct {
	ID   string
	Root string // absolute, symlinks resolved
}

type Entry struct {
	Name string `json:"name"`
	Dir  bool   `json:"dir"`
}

type TextFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Mtime   int64  `json:"mtime"` // µs, fits a JS number exactly (ns would not)
}

func New(id, root string) (*Workspace, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return nil, err
	}
	if st, err := os.Stat(real); err != nil || !st.IsDir() {
		return nil, fmt.Errorf("not a folder: %s", root)
	}
	return &Workspace{ID: id, Root: real}, nil
}

// Resolve maps a workspace-relative path with "/" to an absolute path inside Root.
// It rejects absolute paths, "..", and symlinks that lead out. A missing last element is allowed (new file).
func (w *Workspace) Resolve(rel string) (string, error) {
	if rel == "" {
		rel = "."
	}
	if strings.ContainsRune(rel, 0) || !filepath.IsLocal(filepath.FromSlash(rel)) {
		return "", ErrOutside
	}
	p := filepath.Join(w.Root, filepath.FromSlash(rel))
	real, err := filepath.EvalSymlinks(p)
	if errors.Is(err, fs.ErrNotExist) {
		dir, derr := filepath.EvalSymlinks(filepath.Dir(p))
		if derr != nil {
			return "", derr
		}
		real, err = filepath.Join(dir, filepath.Base(p)), nil
	}
	if err != nil {
		return "", err
	}
	if real != w.Root && !strings.HasPrefix(real, w.Root+string(filepath.Separator)) {
		return "", ErrOutside
	}
	return real, nil
}

// List returns the entries of dir, folders first, then by name.
func (w *Workspace) List(dir string) ([]Entry, error) {
	p, err := w.Resolve(dir)
	if err != nil {
		return nil, err
	}
	des, err := os.ReadDir(p)
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(des))
	for _, d := range des {
		isDir := d.IsDir()
		if d.Type()&fs.ModeSymlink != 0 {
			st, err := os.Stat(filepath.Join(p, d.Name()))
			isDir = err == nil && st.IsDir()
		}
		out = append(out, Entry{Name: d.Name(), Dir: isDir})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Dir != out[j].Dir {
			return out[i].Dir
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

func (w *Workspace) ReadText(rel string) (TextFile, error) {
	p, err := w.Resolve(rel)
	if err != nil {
		return TextFile{}, err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return TextFile{}, err
	}
	st, err := os.Stat(p)
	if err != nil {
		return TextFile{}, err
	}
	return TextFile{Path: rel, Content: string(b), Mtime: st.ModTime().UnixMicro()}, nil
}

// WriteText writes atomically (temp file + fsync + rename) and returns the new mtime.
// expectedMtime is the mtime the buffer was read with, 0 for a new file. If the file on disk differs, it returns ErrConflict.
func (w *Workspace) WriteText(rel, content string, expectedMtime int64) (int64, error) {
	p, err := w.Resolve(rel)
	if err != nil {
		return 0, err
	}
	perm := fs.FileMode(0o644)
	st, err := os.Stat(p)
	switch {
	case err == nil:
		if st.ModTime().UnixMicro() != expectedMtime {
			return 0, ErrConflict
		}
		perm = st.Mode().Perm()
	case errors.Is(err, fs.ErrNotExist):
		if expectedMtime != 0 {
			return 0, ErrConflict
		}
	default:
		return 0, err
	}

	tmp, err := os.CreateTemp(filepath.Dir(p), "."+filepath.Base(p)+".ayaz-*")
	if err != nil {
		return 0, err
	}
	defer os.Remove(tmp.Name()) // no-op after a successful rename
	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		return 0, err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return 0, err
	}
	if err := tmp.Close(); err != nil {
		return 0, err
	}
	if err := os.Chmod(tmp.Name(), perm); err != nil {
		return 0, err
	}
	if err := os.Rename(tmp.Name(), p); err != nil {
		return 0, err
	}
	st, err = os.Stat(p)
	if err != nil {
		return 0, err
	}
	return st.ModTime().UnixMicro(), nil
}

// Registry maps workspace IDs to workspaces. IDs are checked on every call, a window only knows its own.
type Registry struct {
	mu   sync.Mutex
	next int
	ws   map[string]*Workspace
}

func NewRegistry() *Registry { return &Registry{ws: map[string]*Workspace{}} }

func (r *Registry) Open(root string) (*Workspace, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.next++
	w, err := New(strconv.Itoa(r.next), root)
	if err != nil {
		return nil, err
	}
	r.ws[w.ID] = w
	return w, nil
}

// Close forgets the workspace; later calls with its ID fail with ErrUnknown.
func (r *Registry) Close(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.ws, id)
}

func (r *Registry) Get(id string) (*Workspace, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if w, ok := r.ws[id]; ok {
		return w, nil
	}
	return nil, ErrUnknown
}
