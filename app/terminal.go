package app

import (
	"encoding/json"
	"log"
	"os"
	"time"

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
}

// HandleTerminal serves one shell per "pty" stream connection.
func HandleTerminal(c *application.StreamConn) {
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
	home, _ := os.UserHomeDir()
	s, err := pty.Start(home, cfg.Cols, cfg.Rows, shell, "-l")
	if err != nil {
		log.Println("pty:", err)
		return
	}
	defer s.Close()

	go func() {
		pty.Batch(s.Output(), c.Send, time.Duration(cfg.WindowMs)*time.Millisecond, cfg.MaxBytes)
		c.Close() // shell exited: tell the frontend
	}()

	for {
		f, err := c.Receive()
		if err != nil || len(f) == 0 {
			return
		}
		switch f[0] {
		case frameInput:
			s.Write(f[1:])
		case frameResize:
			var sz termConfig
			if json.Unmarshal(f[1:], &sz) == nil && sz.Cols > 0 && sz.Rows > 0 {
				s.Resize(sz.Cols, sz.Rows)
			}
		}
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
