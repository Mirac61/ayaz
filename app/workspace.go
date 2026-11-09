package app

import (
	"context"
	"log"
	"path/filepath"
	"sync"

	"github.com/Mirac61/ayaz/internal/index"
	"github.com/Mirac61/ayaz/internal/lsp"
	"github.com/Mirac61/ayaz/internal/pty"
	"github.com/Mirac61/ayaz/internal/watch"
	"github.com/Mirac61/ayaz/internal/workspace"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// WorkspaceService is the frontend's door to files. Every call names its workspace ID, Go checks it against the registry.
type WorkspaceService struct {
	reg  *workspace.Registry
	args []string

	mu      sync.Mutex
	indexes map[indexKey]*lazyIndex
	terms   map[*pty.Session]bool // running shells, hung up on quit
	servers map[*lsp.Server]bool  // running language servers, stopped on quit
}

type indexKey struct {
	ws      string
	ignored bool
}

type lazyIndex struct {
	once sync.Once
	ix   *index.Index
	err  error
}

type Info struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Root string `json:"root"` // absolute; a key for per-folder state like recent files
}

// NewWorkspaceService takes the CLI arguments: `ayaz <folder>` or `ayaz --workspace <folder>`.
func NewWorkspaceService(args []string) *WorkspaceService {
	return &WorkspaceService{reg: workspace.NewRegistry(), args: args, indexes: map[indexKey]*lazyIndex{}, terms: map[*pty.Session]bool{}, servers: map[*lsp.Server]bool{}}
}

// Initial opens the folder from the command line, nil if there was none.
func (s *WorkspaceService) Initial() (*Info, error) {
	if dir := folderArg(s.args); dir != "" {
		return s.Open(dir)
	}
	return nil, nil
}

// OpenDialog asks for a folder with the native dialog, nil if cancelled.
func (s *WorkspaceService) OpenDialog() (*Info, error) {
	dir, err := application.Get().Dialog.OpenFile().
		CanChooseDirectories(true).CanChooseFiles(false).CanCreateDirectories(true).
		SetTitle("Open folder").PromptForSingleSelection()
	if err != nil || dir == "" {
		return nil, err
	}
	return s.Open(dir)
}

func (s *WorkspaceService) Open(root string) (*Info, error) {
	w, err := s.reg.Open(root)
	if err != nil {
		return nil, err
	}
	// Off the critical path: on Linux, inotify walks every folder first.
	// shortcut: the watcher runs until the process ends; stop it when Close lands (M13, multiple windows).
	go func() {
		if err := watch.Start(context.Background(), w.Root, func(b watch.Batch) { s.changed(w.ID, b) }); err != nil {
			log.Printf("watch %s: %v", w.Root, err)
		}
	}()
	return &Info{ID: w.ID, Name: filepath.Base(w.Root), Root: w.Root}, nil
}

// FsChange is the "fs:changed" event payload.
type FsChange struct {
	WS string `json:"ws"`
	watch.Batch
}

// changed drops the file indexes, so the next Find rebuilds them, and tells the frontend.
// shortcut: a rebuild per batch instead of patching the index; fine while K10 holds, patch it if big repos lag.
func (s *WorkspaceService) changed(ws string, b watch.Batch) {
	s.mu.Lock()
	delete(s.indexes, indexKey{ws, false})
	delete(s.indexes, indexKey{ws, true})
	s.mu.Unlock()
	if a := application.Get(); a != nil {
		a.Event.Emit("fs:changed", FsChange{WS: ws, Batch: b})
	}
}

func (s *WorkspaceService) List(ws, dir string) ([]workspace.Entry, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return nil, err
	}
	return w.List(dir)
}

// ReadText takes a workspace-relative path, or an absolute one inside the library roots (LSP jumps, see readLibrary).
func (s *WorkspaceService) ReadText(ws, path string) (workspace.TextFile, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return workspace.TextFile{}, err
	}
	if filepath.IsAbs(path) {
		return readLibrary(libraryRoots(), path)
	}
	return w.ReadText(path)
}

// WriteText returns the new mtime. A stale expectedMtime fails with "file changed on disk".
func (s *WorkspaceService) WriteText(ws, path, content string, expectedMtime int64) (int64, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return 0, err
	}
	return w.WriteText(path, content, expectedMtime)
}

// Find fuzzy-matches workspace paths. The index is built on the first call (K10) and kept;
// ignored=true searches files Git ignores too (Q26). File changes drop it, see changed.
func (s *WorkspaceService) Find(ws, query string, limit int, ignored bool) ([]index.Match, error) {
	ix, _, err := s.index(ws, ignored)
	if err != nil {
		return nil, err
	}
	return ix.Find(query, limit), nil
}

// index returns the workspace's file index, built on first use, and its root.
func (s *WorkspaceService) index(ws string, ignored bool) (*index.Index, string, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return nil, "", err
	}
	s.mu.Lock()
	l := s.indexes[indexKey{ws, ignored}]
	if l == nil {
		l = &lazyIndex{}
		s.indexes[indexKey{ws, ignored}] = l
	}
	s.mu.Unlock()
	l.once.Do(func() { l.ix, l.err = index.Build(w.Root, ignored) })
	return l.ix, w.Root, l.err
}

// Rank fuzzy-matches a short list from the frontend (recent files, buffers, commands) with the same matcher.
func (s *WorkspaceService) Rank(items []string, query string, limit int) []index.Match {
	return index.New(items).Find(query, limit)
}

func folderArg(args []string) string {
	for i, a := range args {
		if a == "--workspace" && i+1 < len(args) {
			return args[i+1]
		}
		if len(a) > 0 && a[0] != '-' && (i == 0 || args[i-1] != "--workspace") {
			return a
		}
	}
	return ""
}

// Registry is shared with the /fs/ middleware so it serves exactly the folders the frontend opened.
func (s *WorkspaceService) Registry() *workspace.Registry { return s.reg }
