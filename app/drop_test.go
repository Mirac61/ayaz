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

// sparse makes a file of size bytes that costs no disk until it is copied.
func sparse(t *testing.T, name string, size int64) string {
	t.Helper()
	f, err := os.Create(name)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := f.Truncate(size); err != nil {
		t.Fatal(err)
	}
	return name
}

// dropEvents runs one drop and splits what it emitted into its progress and its app:dropped.
func dropEvents(t *testing.T, srcs ...string) ([]DropProgress, DropEvent) {
	t.Helper()
	s := NewWorkspaceService(nil)
	var progress []DropProgress
	var done []DropEvent
	s.emitted = func(_ string, data any) {
		switch e := data.(type) {
		case DropProgress:
			progress = append(progress, e)
		case DropEvent:
			done = append(done, e)
		}
	}
	w, err := s.reg.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s.importDropped(w.ID, "", srcs)
	if len(done) != 1 {
		t.Fatalf("got %d app:dropped, want 1", len(done))
	}
	for _, p := range progress {
		if p.Done > p.Total {
			t.Errorf("progress %+v is past its total", p)
		}
	}
	return progress, done[0]
}

// Two items of a drop share one total: each alone is under progressFrom, together they are over it, and the
// percentage does not start again at the second item.
func TestDropProgressOverAllItems(t *testing.T) {
	const size = progressFrom/2 + 1
	src := t.TempDir()
	progress, done := dropEvents(t, sparse(t, filepath.Join(src, "a.bin"), size), sparse(t, filepath.Join(src, "b.bin"), size))
	if len(progress) == 0 {
		t.Fatal("no progress for a drop over progressFrom")
	}
	for i, p := range progress {
		if p.Total != 2*size || (i > 0 && p.Done < progress[i-1].Done) {
			t.Errorf("progress %d = %+v, want a growing count of %d", i, p, 2*size)
		}
	}
	if len(done.Paths) != 2 || len(done.Errors) != 0 {
		t.Errorf("app:dropped = %+v, want both copied", done)
	}
}

// A folder that fails half way is removed again, so its bytes leave both counts: the next item's progress starts
// from what was copied before it, out of a total without the folder. The drop keeps reporting under progressFrom.
func TestDropProgressDropsFailedItem(t *testing.T) {
	const size = progressFrom/2 + 1
	src := t.TempDir()
	pics := filepath.Join(src, "pics")
	if err := os.Mkdir(pics, 0o755); err != nil {
		t.Fatal(err)
	}
	sparse(t, filepath.Join(pics, "a.png"), size)
	if err := os.WriteFile(filepath.Join(pics, "locked.png"), []byte("b"), 0o000); err != nil {
		t.Fatal(err)
	}
	if f, err := os.Open(filepath.Join(pics, "locked.png")); err == nil {
		f.Close()
		t.Skip("the locked file is readable here (root or Windows), the copy would not fail")
	}
	good := sparse(t, filepath.Join(src, "good.bin"), size)

	progress, done := dropEvents(t, pics, good)
	var first *DropProgress
	for i, p := range progress {
		if p.Name == "pics" && p.Total != 2*size+1 {
			t.Errorf("folder progress %+v, want a total of %d", p, 2*size+1)
		}
		if p.Name == "good.bin" && first == nil {
			first = &progress[i]
		}
	}
	if len(progress) == 0 || progress[0].Name != "pics" || first == nil {
		t.Fatalf("progress = %+v, want the folder's and then good.bin's", progress)
	}
	if first.Total != size || first.Done >= size {
		t.Errorf("good.bin starts at %+v, want under %d of %d", *first, size, size)
	}
	if len(done.Paths) != 1 || done.Paths[0] != "good.bin" || len(done.Errors) != 1 {
		t.Errorf("app:dropped = %+v, want good.bin copied and the folder failed", done)
	}
}
