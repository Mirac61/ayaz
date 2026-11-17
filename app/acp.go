package app

import (
	"errors"
	"log"
	"strings"

	"github.com/Mirac61/ayaz/internal/acp"
	"github.com/Mirac61/ayaz/internal/proc"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type acpConfig struct {
	WS      string `json:"ws"`
	Command string `json:"command"`
}

// HandleACP serves one agent per "acp" stream connection: the configured command runs in the workspace's root and
// bare JSON-RPC messages travel in both directions (Go adds and strips the newline framing). The agent ends with the
// stream, the workspace or the app.
func (s *WorkspaceService) HandleACP(c *application.StreamConn) {
	defer c.Close()
	var cfg acpConfig
	if err := c.ReceiveJSON(&cfg); err != nil || strings.TrimSpace(cfg.Command) == "" {
		return
	}
	w, err := s.reg.Get(cfg.WS)
	if err != nil {
		return
	}
	a, err := acp.Start(w.Root, proc.Shell(), cfg.Command)
	if errors.Is(err, acp.ErrNotFound) {
		emitLsp(LspStatus{WS: cfg.WS, Lang: "agent", State: "missing", Command: strings.Fields(cfg.Command)[0]})
		return
	}
	if err != nil {
		log.Println("acp:", err)
		return
	}
	defer a.Close()
	if !s.trackServer(a, cfg.WS, true) { // the workspace closed while the agent started
		return
	}
	defer s.trackServer(a, cfg.WS, false)
	// A Send stuck on a full pipe never reaches Receive again; the closing stream ends the agent instead.
	go func() {
		<-c.Context().Done()
		a.Close()
	}()

	go func() {
		for {
			msg, err := a.Recv()
			if err == nil {
				err = c.Send(msg)
			}
			if err != nil {
				c.Close() // the agent ended: tell the frontend
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
