package app

import (
	"context"
	"io"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/Mirac61/ayaz/internal/acp"
)

// A stream that closes while Send is stuck on a pipe the agent never reads must still end the agent.
func TestStreamCloseFreesBlockedSendAndEndsAgent(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("needs /bin/sh")
	}
	a, err := acp.Start(t.TempDir(), "/bin/sh", "sleep 60") // never reads stdin
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	ctx, cancel := context.WithCancel(context.Background())
	go closeWhenDone(ctx, a)

	sent := make(chan error, 1)
	go func() { sent <- a.Send([]byte(strings.Repeat("x", 4<<20))) }() // far above the pipe buffer: blocks
	select {
	case err := <-sent:
		t.Fatalf("Send returned before the stream closed: %v", err)
	case <-time.After(300 * time.Millisecond):
	}
	cancel()
	select {
	case err := <-sent:
		if err == nil {
			t.Error("Send should fail once the agent is closed")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Send stays blocked after the stream closed")
	}
	recv := make(chan error, 1)
	go func() { _, err := a.Recv(); recv <- err }()
	select {
	case err := <-recv:
		if err != io.EOF {
			t.Errorf("agent still running: Recv = %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("agent still running: Recv stays blocked")
	}
}
