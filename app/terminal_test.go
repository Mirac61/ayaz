package app

import (
	"testing"
	"time"

	"github.com/Mirac61/ayaz/internal/pty"
)

// Quitting hangs up tracked shells: their output ends.
func TestShutdownClosesShells(t *testing.T) {
	s := NewWorkspaceService(nil)
	sess, err := pty.Start(t.TempDir(), 80, 24, "/bin/sh")
	if err != nil {
		t.Fatal(err)
	}
	out := sess.Output()
	s.track(sess, true)
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
