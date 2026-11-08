package app

import (
	"path/filepath"
	"sync"

	"github.com/Mirac61/ayaz/internal/index"
	"github.com/Mirac61/ayaz/internal/workspace"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// WorkspaceService is the frontend's door to files. Every call names its workspace ID, Go checks it against the registry.
type WorkspaceService struct {
	reg  *workspace.Registry
	args []string

	mu      sync.Mutex
	indexes map[indexKey]*lazyIndex
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
}

// NewWorkspaceService takes the CLI arguments: `ayaz <folder>` or `ayaz --workspace <folder>`.
func NewWorkspaceService(args []string) *WorkspaceService {
	return &WorkspaceService{reg: workspace.NewRegistry(), args: args, indexes: map[indexKey]*lazyIndex{}}
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
	return &Info{ID: w.ID, Name: filepath.Base(w.Root)}, nil
}

func (s *WorkspaceService) List(ws, dir string) ([]workspace.Entry, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return nil, err
	}
	return w.List(dir)
}

func (s *WorkspaceService) ReadText(ws, path string) (workspace.TextFile, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return workspace.TextFile{}, err
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
// ignored=true searches files Git ignores too (Q26).
// shortcut: the index never refreshes until M3 (file watching) updates it.
func (s *WorkspaceService) Find(ws, query string, limit int, ignored bool) ([]index.Match, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	l := s.indexes[indexKey{ws, ignored}]
	if l == nil {
		l = &lazyIndex{}
		s.indexes[indexKey{ws, ignored}] = l
	}
	s.mu.Unlock()
	l.once.Do(func() { l.ix, l.err = index.Build(w.Root, ignored) })
	if l.err != nil {
		return nil, l.err
	}
	return l.ix.Find(query, limit), nil
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
