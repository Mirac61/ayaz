package app

import (
	"context"
	"testing"
)

func TestCloneEmptyURL(t *testing.T) {
	ws := NewWorkspaceService(nil)
	_, err := ws.Clone(context.Background(), "   ")
	if err == nil {
		t.Fatal("expected error for empty URL, got nil")
	}
}

func TestCloneNoDialog(t *testing.T) {
	ws := NewWorkspaceService(nil)
	_, err := ws.Clone(context.Background(), "https://github.com/foo/bar.git")
	if err == nil || err.Error() != "no dialog support" {
		t.Fatalf("expected 'no dialog support', got %v", err)
	}
}
