package app

import (
	"log"
	"os"

	"github.com/Mirac61/ayaz/internal/dap"
	"github.com/Mirac61/ayaz/internal/lsp"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// The debug adapter's command (Delve). It picks a free port and says which on its first line (internal/dap).
const dapCommand = "dlv dap --listen=127.0.0.1:0"

type dapConfig struct {
	WS string `json:"ws"`
}

// HandleDAP serves one debug session per "dap" stream connection: a fresh Delve in the workspace's root, bare JSON
// messages in both directions (Go adds and strips the Content-Length framing). The session ends with the stream, the
// workspace or the app; the program being debugged goes down with the adapter's process group.
func (s *WorkspaceService) HandleDAP(c *application.StreamConn) {
	defer c.Close()
	var cfg dapConfig
	if err := c.ReceiveJSON(&cfg); err != nil {
		return
	}
	w, err := s.reg.Get(cfg.WS)
	if err != nil {
		return
	}
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	if !lsp.Available(shell, "dlv") {
		emitLsp(LspStatus{WS: cfg.WS, Lang: "dlv", State: "missing", Command: "dlv"})
		return
	}
	a, err := dap.Start(w.Root, shell, dapCommand)
	if err != nil {
		log.Println("dap:", err)
		return
	}
	s.trackServer(a, cfg.WS, true)
	defer s.trackServer(a, cfg.WS, false)
	defer a.Close()

	go func() {
		for {
			msg, err := a.Recv()
			if err != nil || c.Send(msg) != nil {
				c.Close() // the adapter ended: tell the frontend
				return
			}
		}
	}()
	for {
		f, err := c.Receive()
		if err != nil || a.Send(f) != nil {
			return
		}
	}
}
