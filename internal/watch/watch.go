// Package watch reports file changes under a workspace root (ADR-0006). All fswatcher use lives here.
package watch

import (
	"context"
	"path/filepath"
	"slices"
	"time"

	"github.com/sgtdi/fswatcher/v2"
)

// Window collects events into one batch, so a `git checkout` arrives as one message (K11 ≤ 500 ms).
const Window = 50 * time.Millisecond

type Batch struct {
	Paths  []string `json:"paths"`  // workspace-relative with "/", files and folders, created, changed or gone
	Rescan bool     `json:"rescan"` // events were lost: treat everything as changed
}

// Start watches root recursively and calls fn with each batch until ctx is cancelled.
// It returns once the watcher is ready, so a change right after Start is seen.
func Start(ctx context.Context, root string, fn func(Batch)) error {
	ready := make(chan struct{})
	w, err := fswatcher.New(
		fswatcher.WithPath(root),
		fswatcher.WithHidden(), // dotfiles are files you edit
		fswatcher.WithExcRegex(`/\.git(/|$)`, `/node_modules(/|$)`, `\.ayaz-[^/]*$`), // last: our own save temp files
		fswatcher.WithCooldown(Window),
		fswatcher.WithReadyChannel(ready),
		fswatcher.WithSeverity(fswatcher.SeverityNone),
	)
	if err != nil {
		return err
	}
	errc := make(chan error, 1)
	go func() { errc <- w.Watch(ctx) }()
	select {
	case <-ready:
	case err := <-errc:
		return err
	}
	go loop(ctx, root, w.Events(), w.Dropped(), fn)
	return nil
}

func loop(ctx context.Context, root string, events, dropped <-chan fswatcher.WatchEvent, fn func(Batch)) {
	var b Batch
	seen := map[string]bool{}
	var flush <-chan time.Time
	for {
		select {
		case <-ctx.Done():
			return
		case e := <-events:
			if slices.Contains(e.Types, fswatcher.EventOverflow) {
				b.Rescan = true
			} else if rel, err := filepath.Rel(root, e.Path); err == nil && rel != "." && filepath.IsLocal(rel) && !seen[rel] {
				seen[rel] = true
				b.Paths = append(b.Paths, filepath.ToSlash(rel))
			}
		case <-dropped:
			b.Rescan = true
		case <-flush:
			if b.Rescan || len(b.Paths) > 0 {
				fn(b)
			}
			b, flush = Batch{}, nil
			clear(seen)
			continue
		}
		if flush == nil {
			flush = time.After(Window)
		}
	}
}
