package app

import (
	"encoding/json"
	"github.com/Mirac61/ayaz/internal/proc"
	"log"
	"sync"

	"github.com/Mirac61/ayaz/internal/dap"
	"github.com/Mirac61/ayaz/internal/lsp"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Adapter name (from frontend/src/debug/adapters.ts) → command and mode.
type dapAdapter struct {
	binary  string
	command string
	stdio   bool
}

var dapAdapters = map[string]dapAdapter{
	"go": {binary: "dlv", command: "dlv dap --listen=127.0.0.1:0", stdio: false},
}

type dapConfig struct {
	WS      string `json:"ws"`
	Adapter string `json:"adapter"`
}

// HandleDAP serves one debug session per "dap" stream connection: a fresh adapter in the workspace's root, bare JSON
// messages in both directions (Go adds and strips the Content-Length framing). The session ends with the stream, the
// workspace or the app; the program being debugged goes down with the adapter's process group.
func (s *WorkspaceService) HandleDAP(c *application.StreamConn) {
	defer c.Close()
	var cfg dapConfig
	if err := c.ReceiveJSON(&cfg); err != nil {
		return
	}
	if cfg.Adapter == "" {
		cfg.Adapter = "go"
	}
	spec, ok := dapAdapters[cfg.Adapter]
	if !ok {
		log.Println("dap: unknown adapter", cfg.Adapter)
		return
	}
	w, err := s.reg.Get(cfg.WS)
	if err != nil {
		return
	}
	shell := proc.Shell()
	if !lsp.Available(shell, spec.binary) {
		emitLsp(LspStatus{WS: cfg.WS, Lang: spec.binary, State: "missing", Command: spec.binary})
		return
	}
	var mu sync.Mutex // the adapter's messages and the program's output both go to c
	onOut := func(category, text string) {
		ev, _ := json.Marshal(map[string]any{"type": "event", "event": "output", "body": map[string]string{"category": category, "output": text}})
		mu.Lock()
		defer mu.Unlock()
		c.Send(ev)
	}
	var a *dap.Adapter
	if spec.stdio {
		a, err = dap.StartStdio(w.Root, shell, spec.command, onOut)
	} else {
		a, err = dap.StartWithOutput(w.Root, shell, spec.command, onOut)
	}
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
			if err == nil {
				mu.Lock()
				err = c.Send(msg)
				mu.Unlock()
			}
			if err != nil {
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
