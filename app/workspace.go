package app

import (
	"context"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/Mirac61/ayaz/internal/git"
	"github.com/Mirac61/ayaz/internal/index"
	"github.com/Mirac61/ayaz/internal/proc"
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

	mu       sync.Mutex
	indexes  map[indexKey]*lazyIndex
	terms    map[*pty.Session]string       // running shells → workspace ("" for spike views), hung up on Close and quit
	servers  map[closer]string             // running language servers and debug adapters → workspace, stopped on Close and quit
	watches  map[string]context.CancelFunc // workspace → its watcher
	windows  map[uint]string               // window ID → its workspace (ADR-0014)
	closing  map[uint]bool                 // windows the frontend allowed to close (nothing unsaved)
	startup  map[uint]*startOpen           // new window → the file it opens with (`ayaz file`), see open.go
	waits    map[int]*wait                 // `ayaz --wait` calls still waiting for their file to close
	nextWait int
}

// closer is a running child process the service ends with its workspace: a language server or a debug adapter.
type closer interface{ Close() }

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
		terms: map[*pty.Session]string{}, servers: map[closer]string{}, watches: map[string]context.CancelFunc{},
		windows: map[uint]string{}, closing: map[uint]bool{}, startup: map[uint]*startOpen{}, waits: map[int]*wait{},
	}
}

// Initial opens the folder from the command line, nil if there was none. New windows don't ask (ADR-0014).
func (s *WorkspaceService) Initial(ctx context.Context) (*Info, error) {
	s.mu.Lock()
	p := s.startup[windowID(ctx)]
	s.mu.Unlock()
	if p != nil { // `ayaz file`: the file's project
		info, err := s.Open(ctx, p.root)
		if info != nil {
			p.ev.WS = info.ID
		}
		return info, err
	}
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
	go git.Watch(wctx, w.Root, func() { s.emit("git:changed", GitChange{WS: w.ID}) })
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
			win.EmitEvent("app:close-request", ws) // events reach every window: the payload says whose it is
		}
	})
	win.OnWindowEvent(events.Common.WindowClosing, func(*application.WindowEvent) {
		s.mu.Lock()
		ws := s.windows[id]
		delete(s.windows, id)
		delete(s.closing, id)
		s.mu.Unlock()
		s.releaseWaits(id)
		s.Close(ws)
	})
}

// ShouldQuit runs on Cmd+Q. It quits only once no window is left; otherwise each window with a workspace gets the
// same "app:close-request" as its close button (unsaved buffers stop it), the others close right away.
// The app then quits after the last window (ApplicationShouldTerminateAfterLastWindowClosed).
func (s *WorkspaceService) ShouldQuit() bool {
	a := application.Get()
	open := 0
	for _, win := range a.Window.GetAll() {
		s.mu.Lock()
		ws, hooked := s.windows[win.ID()]
		closing := s.closing[win.ID()]
		s.mu.Unlock()
		if closing {
			continue
		}
		open++
		if hooked {
			win.EmitEvent("app:close-request", ws)
		} else {
			win.Close()
		}
	}
	return open == 0
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
func (s *WorkspaceService) NewWindow() { NewWindow(application.Get(), "", "/?new") }

// NewWindow opens a window at url with the app's window options; name "" gets Wails' "window-<id>".
func NewWindow(a *application.App, name, url string) *application.WebviewWindow {
	opts := application.WebviewWindowOptions{
		Name:   name,
		Title:  "Ayaz",
		Width:  1200,
		Height: 800,
		// Always translucent: the stylesheet's surfaces are opaque until "glass" (or the Toggle transparency command) makes
		// them see-through, so the mode switches live. Clear until the first paint, which is bg-0 anyway.
		BackgroundType:   application.BackgroundTypeTranslucent,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		// Standard 30 px macOS titlebar (--bar) with native traffic lights.
		Mac:            application.MacWindow{TitleBar: application.MacTitleBarHidden, InvisibleTitleBarHeight: 30, Backdrop: application.MacBackdropTranslucent},
		URL:            url,
		EnableFileDrop: true,
	}
	win := a.Window.NewWithOptions(opts)
	win.OnWindowEvent(events.Common.WindowRuntimeReady, func(*application.WindowEvent) { UncapFrameRate(win) })
	win.OnWindowEvent(events.Common.WindowFilesDropped, func(e *application.WindowEvent) {
		go openDropped(e.Context().DroppedFiles())
	})
	return win
}

// openDropped opens dropped files like `ayaz file` does, through the app's own socket: the window that has the file's
// folder shows it, otherwise a new one opens. Folders are skipped.
func openDropped(paths []string) {
	for _, p := range paths {
		if fi, err := os.Stat(p); err == nil && fi.Mode().IsRegular() {
			SendOpen(SocketPath(), OpenRequest{Path: p})
		}
	}
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
	s.emit("fs:changed", FsChange{WS: ws, Batch: b})
}

// GitChange is the "git:changed" event payload: HEAD, the index or the reflog moved (a commit, checkout, stage).
type GitChange struct {
	WS string `json:"ws"`
}

func (s *WorkspaceService) emit(name string, data any) {
	if a := application.Get(); a != nil {
		a.Event.Emit(name, data)
	}
}

// GitBranch is the folder's branch, a short SHA when detached, "" outside a repository.
func (s *WorkspaceService) GitBranch(ws string) (string, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return "", err
	}
	return git.Branch(w.Root)
}

// GitStatus is each changed, untracked or ignored path's state for the tree (see git.Status).
func (s *WorkspaceService) GitStatus(ws string) (map[string]string, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return nil, err
	}
	return git.Status(w.Root)
}

// HeadFile is a file's text at HEAD; Tracked is false for new files and outside a repository.
type HeadFile struct {
	Text    string `json:"text"`
	Tracked bool   `json:"tracked"`
}

func (s *WorkspaceService) GitHead(ws, path string) (HeadFile, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return HeadFile{}, err
	}
	if _, err := w.Resolve(path); err != nil {
		return HeadFile{}, err
	}
	text, tracked, err := git.Head(w.Root, path)
	return HeadFile{Text: text, Tracked: tracked}, err
}

// GitIndex is a file's text in the index (staged); Tracked is false when it isn't in the index.
func (s *WorkspaceService) GitIndex(ws, path string) (HeadFile, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return HeadFile{}, err
	}
	if _, err := w.Resolve(path); err != nil {
		return HeadFile{}, err
	}
	text, tracked, err := git.Index(w.Root, path)
	return HeadFile{Text: text, Tracked: tracked}, err
}

// GitApplyHunk stages one hunk of a file in the index, or with reverse takes it out again (see git.ApplyHunk).
func (s *WorkspaceService) GitApplyHunk(ws, path, hunk string, reverse bool) error {
	w, err := s.reg.Get(ws)
	if err != nil {
		return err
	}
	if _, err := w.Resolve(path); err != nil {
		return err
	}
	return git.ApplyHunk(w.Root, path, hunk, reverse)
}

// GitBlame is who last changed line (1-based) of a file; text is the buffer's if it has unsaved changes, else "".
// nil: nothing to show (no repository, file not tracked).
func (s *WorkspaceService) GitBlame(ws, path, text string, line int) (*git.Blame, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return nil, err
	}
	if _, err := w.Resolve(path); err != nil {
		return nil, err
	}
	b, ok, err := git.LineBlame(w.Root, path, text, line)
	if !ok || err != nil {
		return nil, err
	}
	return &b, nil
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

// Preview reads the start of a workspace file for a picker's preview pane, at most max bytes.
func (s *WorkspaceService) Preview(ws, path string, max int) (workspace.Preview, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return workspace.Preview{}, err
	}
	return w.ReadPreview(path, max)
}

// WriteText returns the new mtime. A stale expectedMtime fails with "file changed on disk".
func (s *WorkspaceService) WriteText(ws, path, content string, expectedMtime int64) (int64, error) {
	w, err := s.reg.Get(ws)
	if err != nil {
		return 0, err
	}
	old, rerr := w.ReadText(path) // for the local history; a new file has none
	mtime, err := w.WriteText(path, content, expectedMtime)
	if err == nil && rerr == nil {
		keepOld(w.Root, path, old.Content, content)
	}
	return mtime, err
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

// WriteNew saves bytes (a pasted image) as a new file; it fails if the path exists. data arrives as base64.
func (s *WorkspaceService) WriteNew(ws, path string, data []byte) error {
	w, err := s.reg.Get(ws)
	if err != nil {
		return err
	}
	return w.WriteNew(path, data)
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

// Reveal shows the file in Finder (selected), on Windows in File Explorer, on Linux opens its folder.
func (s *WorkspaceService) Reveal(ws, path string) error {
	w, err := s.reg.Get(ws)
	if err != nil {
		return err
	}
	p, err := w.Abs(path)
	if err != nil {
		return err
	}
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-R", p).Run()
	case "windows":
		cmd := exec.Command("explorer.exe", "/select,"+p)
		proc.SetHideWindow(cmd)
		return cmd.Start()
	default:
		return exec.Command("xdg-open", filepath.Dir(p)).Start()
	}
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
