package app

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// OpenEvent is "app:open": a file for the frontend to show, from `ayaz file:line`. Path is workspace-relative.
// Wait is 0, or an ID the frontend answers with WaitDone once the file is closed (`ayaz --wait`).
type OpenEvent struct {
	WS   string `json:"ws"`
	Path string `json:"path"`
	Line int    `json:"line"`
	Col  int    `json:"col"`
	Wait int    `json:"wait"`
}

// startOpen is a new window's first job: its folder, and the file to show once it is up.
type startOpen struct {
	root string
	ev   OpenEvent
}

type wait struct {
	done chan struct{}
	win  uint
}

// projectRoot is the folder a new window opens for path: the repository it lies in, else its own folder.
func projectRoot(path string) string {
	for d := filepath.Dir(path); ; d = filepath.Dir(d) {
		if _, err := os.Stat(filepath.Join(d, ".git")); err == nil {
			return d
		}
		if d == filepath.Dir(d) {
			return filepath.Dir(path)
		}
	}
}

// windowFor is the window whose folder holds path, the deepest folder if several do.
func (s *WorkspaceService) windowFor(path string) (win uint, ws, root string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, id2 := range s.windows {
		w, err := s.reg.Get(id2)
		if err != nil || !strings.HasPrefix(path, w.Root+string(filepath.Separator)) || len(w.Root) <= len(root) {
			continue
		}
		win, ws, root = id, id2, w.Root
	}
	return win, ws, root
}

// handleOpen serves one request from the socket: the window that has the file's folder open shows it, otherwise
// a new window opens on the project. For a waiting client it returns the channel that WaitDone closes.
func (s *WorkspaceService) handleOpen(req OpenRequest) <-chan struct{} {
	a := application.Get()
	win, ws, root := s.windowFor(req.Path)
	var w *wait
	ev := OpenEvent{WS: ws, Line: req.Line, Col: req.Col}
	if req.Wait {
		w = &wait{done: make(chan struct{})}
		s.mu.Lock()
		s.nextWait++
		ev.Wait = s.nextWait
		s.waits[ev.Wait] = w
		s.mu.Unlock()
	}
	if win != 0 {
		ev.Path, _ = filepath.Rel(root, req.Path)
		ev.Path = filepath.ToSlash(ev.Path)
		if w != nil {
			w.win = win
		}
		if target, ok := a.Window.GetByID(win); ok {
			target.EmitEvent("app:open", ev)
			target.Show().Focus()
		}
	} else {
		root = projectRoot(req.Path)
		ev.Path, _ = filepath.Rel(root, req.Path)
		ev.Path = filepath.ToSlash(ev.Path)
		nw := NewWindow(a, "", "/")
		if w != nil {
			w.win = nw.ID()
		}
		s.mu.Lock()
		s.startup[nw.ID()] = &startOpen{root: root, ev: ev}
		s.mu.Unlock()
	}
	if w == nil {
		return nil
	}
	return w.done
}

// ListenOpen starts the socket for `ayaz file` calls. If the app itself was started with one (first), window win
// opens that file's project. The returned func stops listening.
func ListenOpen(s *WorkspaceService, win uint, first *OpenRequest) func() {
	if first != nil {
		root := projectRoot(first.Path)
		rel, _ := filepath.Rel(root, first.Path)
		s.mu.Lock()
		s.startup[win] = &startOpen{root: root, ev: OpenEvent{Path: filepath.ToSlash(rel), Line: first.Line, Col: first.Col}}
		s.mu.Unlock()
	}
	stop, err := ServeOpen(SocketPath(), s.handleOpen)
	if err != nil {
		log.Println("open socket:", err)
		return func() {}
	}
	return stop
}

func windowID(ctx context.Context) uint {
	if win, _ := ctx.Value(application.WindowKey).(application.Window); win != nil {
		return win.ID()
	}
	return 0
}

// TakeOpen is the file this window was opened for, once; nil if none.
func (s *WorkspaceService) TakeOpen(ctx context.Context) *OpenEvent {
	id := windowID(ctx)
	s.mu.Lock()
	defer s.mu.Unlock()
	p := s.startup[id]
	if p == nil || p.ev.WS == "" {
		return nil
	}
	delete(s.startup, id)
	return &p.ev
}

// WaitDone ends the `ayaz --wait` call that got this ID: its file is closed.
func (s *WorkspaceService) WaitDone(id int) {
	s.mu.Lock()
	w := s.waits[id]
	delete(s.waits, id)
	s.mu.Unlock()
	if w != nil {
		close(w.done)
	}
}

// releaseWaits ends the waits of a window that closes: its files are gone with it.
func (s *WorkspaceService) releaseWaits(win uint) {
	s.mu.Lock()
	var ids []int
	for id, w := range s.waits {
		if w.win == win {
			ids = append(ids, id)
		}
	}
	s.mu.Unlock()
	for _, id := range ids {
		s.WaitDone(id)
	}
}
