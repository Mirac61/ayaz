package app

import (
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/Mirac61/ayaz/internal/lsp"
	"github.com/Mirac61/ayaz/internal/pty"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Frames from the frontend on the "pty" stream: first byte is the kind.
const (
	frameInput  = 0 // rest: bytes for the shell
	frameResize = 1 // rest: JSON {cols, rows}
)

// termConfig is the first frame of a "pty" connection.
// WindowMs and MaxBytes are batching knobs for Spike S6; 0 means default.
type termConfig struct {
	Cols     uint16 `json:"cols"`
	Rows     uint16 `json:"rows"`
	WindowMs int    `json:"windowMs"`
	MaxBytes int    `json:"maxBytes"`
	WS       string `json:"ws"`  // workspace ID: the shell starts in its root; "" = home (spike views)
	Cmd      string `json:"cmd"` // run this through the login shell instead of an interactive shell, e.g. "lazygit"
}

// HandleTerminal serves one shell per "pty" stream connection.
func (s *WorkspaceService) HandleTerminal(c *application.StreamConn) {
	defer c.Close()
	var cfg termConfig
	if err := c.ReceiveJSON(&cfg); err != nil || cfg.Cols == 0 || cfg.Rows == 0 {
		return
	}
	if cfg.WindowMs == 0 {
		cfg.WindowMs = 4
	}
	if cfg.MaxBytes == 0 {
		cfg.MaxBytes = 16 << 10
	}
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	dir, _ := os.UserHomeDir()
	if cfg.WS != "" {
		w, err := s.reg.Get(cfg.WS)
		if err != nil {
			return
		}
		dir = w.Root
	}
	args := []string{"-l"} // login shell: a Finder-started app has a bare PATH
	if cfg.Cmd != "" {
		args = append(args, "-c", cfg.Cmd)
	}
	sess, err := pty.Start(dir, cfg.Cols, cfg.Rows, shell, args...)
	if err != nil {
		log.Println("pty:", err)
		return
	}
	s.track(sess, cfg.WS, true)
	defer s.track(sess, cfg.WS, false)
	defer sess.Close()

	go func() {
		pty.Batch(sess.Output(), c.Send, time.Duration(cfg.WindowMs)*time.Millisecond, cfg.MaxBytes)
		c.Close() // shell exited: tell the frontend
	}()

	for {
		f, err := c.Receive()
		if err != nil || len(f) == 0 {
			return
		}
		switch f[0] {
		case frameInput:
			sess.Write(f[1:])
		case frameResize:
			var sz termConfig
			if json.Unmarshal(f[1:], &sz) == nil && sz.Cols > 0 && sz.Rows > 0 {
				sess.Resize(sz.Cols, sz.Rows)
			}
		}
	}
}

func (s *WorkspaceService) track(sess *pty.Session, ws string, on bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if on {
		s.terms[sess] = ws
	} else {
		delete(s.terms, sess)
	}
}

// ServiceShutdown hangs up every shell and server, so quitting leaves no processes behind (Wails calls it on quit).
func (s *WorkspaceService) ServiceShutdown() error {
	s.stop(func(string) bool { return true })
	return nil
}

// stop closes the shells and language servers whose workspace matches. Collected under the lock, closed outside it,
// because a closing handler takes the lock to untrack itself.
func (s *WorkspaceService) stop(match func(ws string) bool) {
	s.mu.Lock()
	var terms []*pty.Session
	var servers []*lsp.Server
	for t, ws := range s.terms {
		if match(ws) {
			terms = append(terms, t)
		}
	}
	for srv, ws := range s.servers {
		if match(ws) {
			servers = append(servers, srv)
		}
	}
	s.mu.Unlock()
	for _, t := range terms {
		t.Close()
	}
	for _, srv := range servers {
		srv.Close()
	}
}

// HandleEcho sends every frame straight back (Spike S7: stream overhead for LSP-like messages).
func HandleEcho(c *application.StreamConn) {
	defer c.Close()
	for {
		f, err := c.Receive()
		if err != nil || c.Send(f) != nil {
			return
		}
	}
}
