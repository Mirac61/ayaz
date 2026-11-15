package app

import (
	"sync"
	"time"

	"github.com/Mirac61/ayaz/internal/search"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type searchConfig struct {
	WS      string `json:"ws"`
	Ignored bool   `json:"ignored"` // search Git-ignored files too, like Find files
	search.Options
}

// searchFrame is one frame on the "search" stream: a batch of hits, or the reason the search can't run.
type searchFrame struct {
	Hits  []search.Hit `json:"hits,omitempty"`
	Error string       `json:"error,omitempty"`
}

// HandleSearch runs one search per "search" stream connection over the same files as Find files (ADR-0016).
// The first frame is the query; hits follow in batches every 30 ms; the stream closes when the search is done.
// The frontend closes it to cancel (a new keystroke), which cancels the connection's context.
func (s *WorkspaceService) HandleSearch(c *application.StreamConn) {
	defer c.Close()
	var cfg searchConfig
	if c.ReceiveJSON(&cfg) != nil {
		return
	}
	re, err := search.Compile(cfg.Options)
	if err != nil {
		c.SendJSON(searchFrame{Error: err.Error()})
		return
	}
	ix, root, err := s.index(cfg.WS, cfg.Ignored)
	if err != nil {
		c.SendJSON(searchFrame{Error: err.Error()})
		return
	}

	var mu sync.Mutex
	var batch []search.Hit
	flush := func() {
		mu.Lock()
		b := batch
		batch = nil
		mu.Unlock()
		if len(b) > 0 {
			c.SendJSON(searchFrame{Hits: b})
		}
	}
	done, stopped := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(stopped)
		t := time.NewTicker(30 * time.Millisecond)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				flush()
			case <-done:
				return
			}
		}
	}()
	search.Run(c.Context(), root, ix.Paths(), re, func(h []search.Hit) {
		mu.Lock()
		batch = append(batch, h...)
		mu.Unlock()
	})
	close(done)
	<-stopped // its last flush must land before Close
	flush()
}
