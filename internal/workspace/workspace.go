// Package workspace is the only way to touch files: every path from the frontend goes through Resolve.
package workspace

import (
	"bytes"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"
)

var (
	ErrOutside  = errors.New("path outside workspace")
	ErrConflict = errors.New("file changed on disk")
	ErrBinary   = errors.New("not a text file (binary or not UTF-8): saving it would change its bytes")
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
	if !utf8.Valid(b) || strings.ContainsRune(string(b), 0) {
		return TextFile{}, ErrBinary
	}
	st, err := os.Stat(p)
	if err != nil {
		return TextFile{}, err
	}
	return TextFile{Path: rel, Content: string(b), Mtime: st.ModTime().UnixMicro()}, nil
}

// Preview is the start of a text file for a picker's preview pane: at most max bytes, More when the file goes on.
type Preview struct {
	Text string `json:"text"`
	More bool   `json:"more"`
}

// ReadPreview reads only the first max bytes, so a huge file costs no more than a small one.
// A binary file is ErrBinary; a multi-byte character cut by the limit is dropped, not an error.
func (w *Workspace) ReadPreview(rel string, max int) (Preview, error) {
	p, err := w.Resolve(rel)
	if err != nil {
		return Preview{}, err
	}
	f, err := os.Open(p)
	if err != nil {
		return Preview{}, err
	}
	defer f.Close()
	buf, err := io.ReadAll(io.LimitReader(f, int64(max)+1)) // grows with the file: a small one costs a small buffer
	if err != nil {
		return Preview{}, err
	}
	n := len(buf)
	more := n > max
	if more {
		n = max
		for n > 0 && !utf8.RuneStart(buf[n]) { // buf[n] starts the next character, or continues a cut one
			n--
		}
	}
	b := buf[:n]
	if !utf8.Valid(b) || bytes.IndexByte(b, 0) >= 0 {
		return Preview{}, ErrBinary
	}
	return Preview{Text: string(b), More: more}, nil
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

// winSep: on Windows "\" separates for filepath but not for path, so a rel holding one is refused.
var pathSep = filepath.Separator // a var so a test can pretend to be Windows

func winSep(rel string) bool { return pathSep == '\\' && strings.ContainsRune(rel, '\\') }

// entry resolves rel's folder but not rel itself, so a symlink is renamed or trashed as a link, never its target.
// The root is no entry.
func (w *Workspace) entry(rel string) (string, error) {
	clean := path.Clean(rel)
	// On Windows filepath.Join reads "\" as a separator that path.Dir ignores: "..\x" would escape the workspace.
	if winSep(rel) {
		return "", ErrOutside
	}
	if clean == "." || clean == ".." || strings.ContainsRune(clean, 0) {
		return "", ErrOutside
	}
	dir, err := w.Resolve(path.Dir(clean))
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, path.Base(clean)), nil
}

// Create makes an empty file, or a folder with dir. Missing parent folders are created too; an existing rel is an error.
func (w *Workspace) Create(rel string, dir bool) error {
	f, err := w.create(rel, dir, 0o644)
	if f != nil {
		return f.Close()
	}
	return err
}

// create is Create with the file's mode and the new file left open for writing (nil for a folder), so a copy never
// exists wider than its source (before the umask) and needs no second open.
func (w *Workspace) create(rel string, dir bool, perm os.FileMode) (*os.File, error) {
	if winSep(rel) { // before any parent folder is made
		return nil, ErrOutside
	}
	parts := strings.Split(path.Clean(rel), "/")
	for i := 1; i < len(parts); i++ {
		p, err := w.entry(strings.Join(parts[:i], "/"))
		if err != nil {
			return nil, err
		}
		if err := os.Mkdir(p, 0o755); err != nil && !errors.Is(err, fs.ErrExist) {
			return nil, err
		}
	}
	p, err := w.entry(rel)
	if err != nil {
		return nil, err
	}
	if dir {
		return nil, os.Mkdir(p, 0o755)
	}
	return os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, perm)
}

// WriteNew creates a file with data, with its missing parent folders; an existing rel is an error (pasted images never replace one).
func (w *Workspace) WriteNew(rel string, data []byte) error {
	if err := w.Create(rel, false); err != nil {
		return err
	}
	p, err := w.entry(rel)
	if err != nil {
		return err
	}
	if err := os.WriteFile(p, data, 0o644); err != nil {
		os.Remove(p)
		return err
	}
	return nil
}

// Rename moves a file or folder inside the workspace; it never replaces an existing target.
func (w *Workspace) Rename(from, to string) error {
	src, err := w.entry(from)
	if err != nil {
		return err
	}
	dst, err := w.entry(to)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(dst); err == nil {
		return fmt.Errorf("%s already exists", to)
	}
	return os.Rename(src, dst)
}

// Copy duplicates a file inside the workspace, with its permissions and missing parent folders of the target. It never
// replaces an existing target. shortcut: files only, folders need a recursive walk
func (w *Workspace) Copy(from, to string) error {
	src, err := w.entry(from)
	if err != nil {
		return err
	}
	st, err := os.Lstat(src)
	if err != nil {
		return err
	}
	if !st.Mode().IsRegular() {
		return errors.New("only files can be duplicated")
	}
	return w.copyFile(src, st.Mode().Perm(), to, nil)
}

// Import copies a file or folder from anywhere (a Finder or Dock drop) into the workspace folder dir ("" is the root),
// under its own name. It never replaces anything, and a folder that fails half way is removed again.
// add, if not nil, is told how many bytes each read got; Size is what they add up to.
func (w *Workspace) Import(src, dir string, add func(int)) (string, error) {
	rel := path.Join(dir, filepath.Base(src))
	st, err := os.Stat(src)
	if err != nil {
		return "", err
	}
	if st.Mode().IsRegular() {
		return rel, w.copyFile(src, st.Mode().Perm(), rel, add)
	}
	if !st.IsDir() {
		return "", fmt.Errorf("%s is not a file or folder", filepath.Base(src))
	}
	into, err := w.Resolve(dir)
	if err != nil {
		return "", err
	}
	// Same folder by inode, not by path: Root keeps the case it was opened with, and macOS ignores case (~/Code is ~/code)
	for p := into; ; p = filepath.Dir(p) {
		if pst, err := os.Stat(p); err == nil && os.SameFile(st, pst) {
			return "", fmt.Errorf("%s can't be copied into itself", filepath.Base(src))
		}
		if filepath.Dir(p) == p {
			break
		}
	}
	if _, err := w.create(rel, true, 0); err != nil { // exclusive, so the cleanup below only removes our own folder
		if errors.Is(err, fs.ErrExist) {
			return "", fmt.Errorf("%s already exists", rel)
		}
		return "", err
	}
	dst, err := w.entry(rel)
	if err != nil {
		return "", err
	}
	fsys := os.DirFS(src).(dirFS)
	if err := os.CopyFS(dst, countFS{fsys, add}); err != nil {
		os.RemoveAll(dst)
		return "", err
	}
	return rel, nil
}

// Size is how many bytes Import reads for src: a file's size, or a folder's regular files (links are copied as links).
// Errors count 0, a total that is a little off still shows progress.
func Size(src string) int64 {
	st, err := os.Stat(src)
	switch {
	case err != nil:
		return 0
	case st.Mode().IsRegular():
		return st.Size()
	case !st.IsDir():
		return 0
	}
	var total int64
	_ = fs.WalkDir(os.DirFS(src), ".", func(_ string, d fs.DirEntry, err error) error {
		if err == nil && d.Type().IsRegular() {
			if info, err := d.Info(); err == nil {
				total += info.Size()
			}
		}
		return nil
	})
	return total
}

// dirFS is what os.DirFS offers and os.CopyFS uses (links, listings); countFS keeps all of it and counts what files read.
type dirFS interface {
	fs.ReadDirFS
	fs.ReadLinkFS
	fs.StatFS
}

type countFS struct {
	dirFS
	add func(int)
}

func (c countFS) Open(name string) (fs.File, error) {
	f, err := c.dirFS.Open(name)
	if err != nil || c.add == nil {
		return f, err
	}
	return countFile{f, c.add}, nil
}

type countFile struct {
	fs.File
	add func(int)
}

func (f countFile) Read(p []byte) (int, error) {
	n, err := f.File.Read(p)
	f.add(n)
	return n, err
}

// copyFile copies the file at the absolute path src to the workspace path to, with mode perm and missing parents.
// add, if not nil, is told how many bytes each read got.
func (w *Workspace) copyFile(src string, perm fs.FileMode, to string, add func(int)) (err error) {
	// create makes the target exclusively (O_EXCL) and its parents, so a race cannot replace anything. It stays open
	// for the content, so even a 0400 source copies; the final Chmod sets the exact mode (the umask may have cut it).
	out, err := w.create(to, false, perm)
	if err != nil {
		if errors.Is(err, fs.ErrExist) {
			return fmt.Errorf("%s already exists", to)
		}
		return err
	}
	defer out.Close()
	dst, err := w.entry(to) // after create: its parent folders exist now
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			os.Remove(dst)
		}
	}()
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	var r io.Reader = in
	if add != nil {
		r = countFile{in, add}
	}
	if _, err = io.Copy(out, r); err != nil {
		return err
	}
	if err = out.Close(); err != nil {
		return err
	}
	return os.Chmod(dst, perm)
}

// Trash moves a file or folder to the system trash.
func (w *Workspace) Trash(rel string) error {
	p, err := w.entry(rel)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(p); err != nil {
		return err
	}
	return trash(p)
}

// Abs is rel as an absolute path (copy path, reveal in Finder).
func (w *Workspace) Abs(rel string) (string, error) { return w.entry(rel) }

// Registry maps workspace IDs to workspaces. IDs are checked on every call, a window only knows its own.
type Registry struct {
	mu sync.Mutex
	ws map[string]*Workspace
}

func NewRegistry() *Registry { return &Registry{ws: map[string]*Workspace{}} }

func (r *Registry) Open(root string) (*Workspace, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	// Unguessable ID: the sandboxed HTML preview may import /fs/<id>/ scripts and only knows its own ID.
	w, err := New(rand.Text(), root)
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
