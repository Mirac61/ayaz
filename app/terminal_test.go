package app

import (
	"context"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/Mirac61/ayaz/internal/lsp"
	"github.com/Mirac61/ayaz/internal/pty"
)

// Quitting hangs up tracked shells: their output ends.
func TestShutdownClosesShells(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("needs /bin/sh; the ConPTY side is checked on a real Windows machine")
	}
	s := NewWorkspaceService(nil)
	sess, err := pty.Start(t.TempDir(), 80, 24, "/bin/sh")
	if err != nil {
		t.Fatal(err)
	}
	out := sess.Output()
	s.track(sess, "", true)
	s.ServiceShutdown()
	sess.Close() // the stream handler's deferred Close must not hang
	select {
	case <-drain(out):
	case <-time.After(5 * time.Second):
		t.Fatal("shell still running after shutdown")
	}
}

func drain(ch <-chan []byte) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		for range ch {
		}
		close(done)
	}()
	return done
}

// Close(ws) stops that workspace's shells and servers and forgets its ID; another workspace keeps running (ADR-0014).
func TestCloseWorkspace(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("needs /bin/sh; the ConPTY side is checked on a real Windows machine")
	}
	s := NewWorkspaceService(nil)
	a, err := s.Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	shell := func(ws string) <-chan []byte {
		sess, err := pty.Start(t.TempDir(), 80, 24, "/bin/sh")
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(sess.Close)
		s.track(sess, ws, true)
		return sess.Output()
	}
	outA, outB := shell(a.ID), shell(b.ID)
	srv, err := lsp.Start(t.TempDir(), "/bin/sh", "cat")
	if err != nil {
		t.Fatal(err)
	}
	s.trackServer(srv, a.ID, true)

	s.Close(a.ID)
	select {
	case <-drain(outA):
	case <-time.After(5 * time.Second):
		t.Fatal("shell of the closed workspace still running")
	}
	if _, err := srv.Recv(); err == nil {
		t.Fatal("server of the closed workspace still running")
	}
	if _, err := s.List(a.ID, ""); err == nil {
		t.Fatal("closed workspace ID still works")
	}
	select {
	case <-drain(outB):
		t.Fatal("the other workspace's shell was closed")
	case <-time.After(200 * time.Millisecond):
	}
	if _, err := s.List(b.ID, ""); err != nil {
		t.Fatal(err)
	}
}

func TestStartDir(t *testing.T) {
	root, other := t.TempDir(), t.TempDir()
	for _, c := range []struct{ want, got string }{
		{other, other},
		{"", root},
		{"relative/dir", root},
		{filepath.Join(other, "gone"), root},
	} {
		if got := startDir(root, c.want); got != c.got {
			t.Errorf("startDir(%q) = %q, want %q", c.want, got, c.got)
		}
	}
}
