package app

import (
	"context"
	"log"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/Mirac61/ayaz/internal/index"
	"github.com/Mirac61/ayaz/internal/lsp"
	"github.com/Mirac61/ayaz/internal/pty"
	"github.com/Mirac61/ayaz/internal/watch"
	"github.com/Mirac61/ayaz/internal/workspace"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// WorkspaceService is the frontend's door to files. Every call names its workspace ID, Go checks it against the registry.
type WorkspaceService struct {
	reg  *workspace.Registry
	args []string

	mu      sync.Mutex
	indexes map[indexKey]*lazyIndex
	terms   map[*pty.Session]string       // running shells → workspace ("" for spike views), hung up on Close and quit
	servers map[*lsp.Server]string        // running language servers → workspace, stopped on Close and quit
	watches map[string]context.CancelFunc // workspace → its watcher
	windows map[uint]string               // window ID → its workspace (ADR-0014)
	closing map[uint]bool                 // windows the frontend allowed to close (nothing unsaved)
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
	return &WorkspaceService{
		reg: workspace.NewRegistry(), args: args, indexes: map[indexKey]*lazyIndex{},
		terms: map[*pty.Session]string{}, servers: map[*lsp.Server]string{}, watches: map[string]context.CancelFunc{},
		windows: map[uint]string{}, closing: map[uint]bool{},
	}
}

// Initial opens the folder from the command line, nil if there was none. New windows don't ask (ADR-0014).
func (s *WorkspaceService) Initial(ctx context.Context) (*Info, error) {
	if dir := folderArg(s.args); dir != "" {
		return s.Open(ctx, dir)
	}
	return nil, nil
}

// OpenDialog asks for a folder with the native dialog, nil if cancelled.
func (s *WorkspaceService) OpenDialog(ctx context.Context) (*Info, error) {
	dir, err := application.Get().Dialog.OpenFile().
		CanChooseDirectories(true).CanChooseFiles(false).CanCreateDirectories(true).
		SetTitle("Open folder").PromptForSingleSelection()
	if err != nil || dir == "" {
		return nil, err
	}
	return s.Open(ctx, dir)
}

// Open registers the folder as a workspace of the calling window and starts watching it.
func (s *WorkspaceService) Open(ctx context.Context, root string) (*Info, error) {
	w, err := s.reg.Open(root)
	if err != nil {
		return nil, err
	}
	wctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.watches[w.ID] = cancel
	s.mu.Unlock()
	// Off the critical path: on Linux, inotify walks every folder first.
	go func() {
		if err := watch.Start(wctx, w.Root, func(b watch.Batch) { s.changed(w.ID, b) }); err != nil {
			log.Printf("watch %s: %v", w.Root, err)
		}
	}()
	s.bindWindow(ctx, w.ID)
	return &Info{ID: w.ID, Name: filepath.Base(w.Root), Root: w.Root}, nil
}

// Close tears a workspace down: watcher, indexes, shells and language servers, then the ID itself.
// The frontend calls it when switching folders; closing a window calls it too.
func (s *WorkspaceService) Close(ws string) {
	s.mu.Lock()
	if cancel := s.watches[ws]; cancel != nil {
		cancel()
	}
	delete(s.watches, ws)
	delete(s.indexes, indexKey{ws, false})
	delete(s.indexes, indexKey{ws, true})
	s.mu.Unlock()
	s.stop(func(w string) bool { return w == ws })
	s.reg.Close(ws)
}

// bindWindow ties ws to the calling window. Its first workspace hooks the window: a close asks the frontend first
// ("app:close-request", unsaved buffers), and a close that goes through tears the workspace down.
// No window in the server build and in tests.
func (s *WorkspaceService) bindWindow(ctx context.Context, ws string) {
	win, _ := ctx.Value(application.WindowKey).(application.Window)
	if win == nil {
		return
	}
	id := win.ID()
	s.mu.Lock()
	_, hooked := s.windows[id]
	s.windows[id] = ws
	s.mu.Unlock()
	if hooked {
		return
	}
	win.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		s.mu.Lock()
		ok := s.closing[id]
		s.mu.Unlock()
		if !ok {
			e.Cancel()
			win.EmitEvent("app:close-request")
		}
	})
	win.OnWindowEvent(events.Common.WindowClosing, func(*application.WindowEvent) {
		s.mu.Lock()
		ws := s.windows[id]
		delete(s.windows, id)
		delete(s.closing, id)
		s.mu.Unlock()
		s.Close(ws)
	})
}

// CloseWindow closes the calling window; the frontend calls it once nothing is unsaved (or the user forced it).
// Without a window (server build) it does nothing.
func (s *WorkspaceService) CloseWindow(ctx context.Context) {
	win, _ := ctx.Value(application.WindowKey).(application.Window)
	if win == nil {
		return
	}
	s.mu.Lock()
	s.closing[win.ID()] = true
	s.mu.Unlock()
	win.Close()
}

// NewWindow opens another window on the welcome screen.
func (s *WorkspaceService) NewWindow() { NewWindow(application.Get(), "/?new") }

// NewWindow opens a window at url with the app's window options.
func NewWindow(a *application.App, url string) *application.WebviewWindow {
	win := a.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Ayaz",
		Width:  1200,
		Height: 800,
		// bg-0, so there is no white flash before the first paint.
		BackgroundColour: application.NewRGB(0x16, 0x16, 0x17),
		// The traffic lights sit in the frontend's 38 px .titlebar.
		Mac: application.MacWindow{TitleBar: application.MacTitleBarHiddenInset, InvisibleTitleBarHeight: 38},
		URL: url,
	})
	win.OnWindowEvent(events.Common.WindowRuntimeReady, func(*application.WindowEvent) { UncapFrameRate(win) })
	return win
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
func (s *WorkspaceService) Create(ws, path string, dir bool) error {
	w, err := s.reg.Get(ws)
	if err != nil {
		return err
	}
	return w.Create(path, dir)
}

func (s *WorkspaceService) Rename(ws, from, to string) error {
	w, err := s.reg.Get(ws)
	if err != nil {
		return err
	}
	return w.Rename(from, to)
}

func (s *WorkspaceService) Trash(ws, path string) error {
	w, err := s.reg.Get(ws)
	if err != nil {
		return err
	}
	return w.Trash(path)
}

// Reveal shows the file in Finder (selected), on Linux opens its folder.
func (s *WorkspaceService) Reveal(ws, path string) error {
	w, err := s.reg.Get(ws)
	if err != nil {
		return err
	}
	p, err := w.Abs(path)
	if err != nil {
		return err
	}
	if runtime.GOOS == "darwin" {
		return exec.Command("open", "-R", p).Run()
	}
	return exec.Command("xdg-open", filepath.Dir(p)).Start()
}

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
