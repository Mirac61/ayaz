package app

import (
	"log"
	"os"

	"github.com/Mirac61/ayaz/internal/lsp"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Language ID → server command. Only Go until M9; a missing binary just ends the stream.
var lspServers = map[string]string{"go": "gopls"}

type lspConfig struct {
	WS   string `json:"ws"`
	Lang string `json:"lang"`
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
