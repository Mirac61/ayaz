package app

import (
	"os"
	"path/filepath"
	"testing"
)

// A drop with a failing item still ends with "app:dropped", under the ID its progress came with: otherwise the status
// line would show "Copying" forever. A second drop gets its own ID.
func TestDropEndsUnderItsProgressID(t *testing.T) {
	s := NewWorkspaceService(nil)
	var events []any
	s.emitted = func(_ string, data any) { events = append(events, data) }
	w, err := s.reg.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	src := t.TempDir()
	big := filepath.Join(src, "big.bin")
	f, err := os.Create(big)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(progressFrom); err != nil {
		t.Fatal(err)
	}
	f.Close()

	s.importDropped(w.ID, "", []string{big, filepath.Join(src, "missing")})
	var progress int
	var done *DropEvent
	for _, e := range events {
		switch e := e.(type) {
		case DropProgress:
			progress++
			if done != nil {
				t.Errorf("progress %+v after app:dropped", e)
			}
		case DropEvent:
			if done != nil {
				t.Fatalf("second app:dropped %+v", e)
			}
			done = &e
		}
	}
	if progress == 0 || done == nil {
		t.Fatalf("got %d progress events and app:dropped %v", progress, done)
	}
	for _, e := range events[:progress] {
		if p := e.(DropProgress); p.ID != done.ID || p.Name != "big.bin" {
			t.Errorf("progress %+v, want ID %d", p, done.ID)
		}
	}
	if len(done.Paths) != 1 || done.Paths[0] != "big.bin" || len(done.Errors) != 1 {
		t.Errorf("app:dropped = %+v, want big.bin copied and one error", *done)
	}

	events = nil
	s.importDropped(w.ID, "", []string{filepath.Join(src, "missing")})
	if len(events) != 1 || events[0].(DropEvent).ID == done.ID || len(events[0].(DropEvent).Errors) != 1 {
		t.Errorf("second drop = %+v, want one failed app:dropped with a new ID", events)
	}
}
