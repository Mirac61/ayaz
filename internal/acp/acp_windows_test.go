package acp

import (
	"testing"
	"time"
)

// The POSIX tests are skipped on Windows; this one covers the bounded Close there.
func TestCloseEndsAgentOnWindows(t *testing.T) {
	a, err := Start(t.TempDir(), "", "ping -n 60 127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { a.Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("Close hangs")
	}
	if _, err := a.Recv(); err == nil {
		t.Error("agent still running after Close")
	}
}
