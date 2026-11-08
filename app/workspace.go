package app

import (
	"path/filepath"

	"github.com/Mirac61/ayaz/internal/workspace"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// WorkspaceService is the frontend's door to files. Every call names its workspace ID, Go checks it against the registry.
type WorkspaceService struct {
	reg  *workspace.Registry
	args []string
}

type Info struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// NewWorkspaceService takes the CLI arguments: `ayaz <folder>` or `ayaz --workspace <folder>`.
func NewWorkspaceService(args []string) *WorkspaceService {
	return &WorkspaceService{reg: workspace.NewRegistry(), args: args}
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
