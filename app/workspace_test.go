package app

import (
	"errors"
	"testing"

	"github.com/Mirac61/ayaz/internal/workspace"
)

// Every workspace method answers an unknown workspace ID with ErrUnknown instead of a panic or a zero value.
func TestUnknownWorkspaceIsAnError(t *testing.T) {
	s := NewWorkspaceService(nil)
	ws := "nope"
	calls := map[string]func() error{
		"GitBranch":         func() error { _, err := s.GitBranch(ws); return err },
		"GitStatus":         func() error { _, err := s.GitStatus(ws); return err },
		"GitDetailedStatus": func() error { _, err := s.GitDetailedStatus(ws); return err },
		"GitStageFile":      func() error { return s.GitStageFile(ws, "a") },
		"GitUnstageFile":    func() error { return s.GitUnstageFile(ws, "a") },
		"GitDiscardFile":    func() error { return s.GitDiscardFile(ws, "a") },
		"GitStageAll":       func() error { return s.GitStageAll(ws) },
		"GitUnstageAll":     func() error { return s.GitUnstageAll(ws) },
		"GitCommit":         func() error { return s.GitCommit(ws, "m") },
		"GitPush":           func() error { return s.GitPush(ws) },
		"GitPull":           func() error { return s.GitPull(ws) },
		"GitFetch":          func() error { return s.GitFetch(ws) },
		"GitRebase":         func() error { return s.GitRebase(ws) },
		"GitHead":           func() error { _, err := s.GitHead(ws, "a"); return err },
		"GitIndex":          func() error { _, err := s.GitIndex(ws, "a"); return err },
		"GitApplyHunk":      func() error { return s.GitApplyHunk(ws, "a", "", false) },
		"GitBlame":          func() error { _, err := s.GitBlame(ws, "a", "", 1); return err },
		"List":              func() error { _, err := s.List(ws, ""); return err },
		"ReadText":          func() error { _, err := s.ReadText(ws, "a"); return err },
		"Preview":           func() error { _, err := s.Preview(ws, "a", 10); return err },
		"WriteText":         func() error { _, err := s.WriteText(ws, "a", "", 0); return err },
		"Create":            func() error { return s.Create(ws, "a", false) },
		"WriteNew":          func() error { return s.WriteNew(ws, "a", nil) },
		"Rename":            func() error { return s.Rename(ws, "a", "b") },
		"Trash":             func() error { return s.Trash(ws, "a") },
		"Reveal":            func() error { return s.Reveal(ws, "a") },
		"Find":              func() error { _, err := s.Find(ws, "a", 1, false); return err },
		"History":           func() error { _, err := s.History(ws, "a"); return err },
		"HistoryText":       func() error { _, err := s.HistoryText(ws, "a", 0); return err },
		"SwapWrite":         func() error { return s.SwapWrite(ws, "a", "") },
		"SwapRemove":        func() error { return s.SwapRemove(ws, "a") },
		"Swaps":             func() error { _, err := s.Swaps(ws); return err },
	}
	for name, call := range calls {
		if err := call(); !errors.Is(err, workspace.ErrUnknown) {
			t.Errorf("%s(%q) = %v, want ErrUnknown", name, ws, err)
		}
	}
}
