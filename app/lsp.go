package app

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/Mirac61/ayaz/internal/lsp"
	"github.com/Mirac61/ayaz/internal/workspace"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Language ID → server command. Only Go until M9; a missing binary just ends the stream.
var lspServers = map[string]string{"go": "gopls"}

type lspConfig struct {
	WS   string `json:"ws"`
	Lang string `json:"lang"`
}

// LspStatus is the "lsp:status" event; State is only "missing" so far (the server isn't installed).
type LspStatus struct {
	WS      string `json:"ws"`
	Lang    string `json:"lang"`
	State   string `json:"state"`
	Command string `json:"command"`
}

// HandleLSP serves one language server per "lsp" stream connection. Frames are bare JSON in both directions;
// Go adds and strips the Content-Length framing. If the server dies the stream closes and the frontend
// reconnects (shortcut: no shared server per workspace+language, the frontend opens one stream per pair).
func (s *WorkspaceService) HandleLSP(c *application.StreamConn) {
	defer c.Close()
	var cfg lspConfig
	if err := c.ReceiveJSON(&cfg); err != nil {
		return
	}
	command, ok := lspServers[cfg.Lang]
	w, err := s.reg.Get(cfg.WS)
	if !ok || err != nil {
		return
	}
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	if !lsp.Available(shell, command) {
		if a := application.Get(); a != nil {
			a.Event.Emit("lsp:status", LspStatus{WS: cfg.WS, Lang: cfg.Lang, State: "missing", Command: command})
		}
		return
	}
	srv, err := lsp.Start(w.Root, shell, command)
	if err != nil {
		log.Println("lsp:", err)
		return
	}
	s.trackServer(srv, true)
	defer s.trackServer(srv, false)
	defer srv.Close()

	go func() {
		for {
			msg, err := srv.Recv()
			if err != nil || c.Send(msg) != nil {
				c.Close() // server exited: tell the frontend
				return
			}
		}
	}()
	for {
		f, err := c.Receive()
		if err != nil || srv.Send(f) != nil {
			return
		}
	}
}

func (s *WorkspaceService) trackServer(srv *lsp.Server, on bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if on {
		s.servers[srv] = true
	} else {
		delete(s.servers, srv)
	}
}

// libraryRoots are the folders a jump may lead into outside the workspace: the Go toolchain and module cache.
// shortcut: Go only and asked once per process; add per-language roots with M9.
var libraryRoots = sync.OnceValue(func() []string {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	out, err := exec.Command(shell, "-l", "-c", "go env GOROOT GOMODCACHE").Output()
	if err != nil {
		return nil
	}
	return strings.Fields(string(out))
})

// readLibrary reads a file the language server pointed to outside the workspace, only below one of roots.
// The frontend shows it read-only; WriteText still rejects absolute paths.
func readLibrary(roots []string, path string) (workspace.TextFile, error) {
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return workspace.TextFile{}, err
	}
	for _, r := range roots {
		if r, err := filepath.EvalSymlinks(r); err == nil && strings.HasPrefix(real, r+string(filepath.Separator)) {
			b, err := os.ReadFile(real)
			if err != nil {
				return workspace.TextFile{}, err
			}
			st, err := os.Stat(real)
			if err != nil {
				return workspace.TextFile{}, err
			}
			return workspace.TextFile{Path: path, Content: string(b), Mtime: st.ModTime().UnixMicro()}, nil
		}
	}
	return workspace.TextFile{}, workspace.ErrOutside
}
