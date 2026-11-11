package pty

import (
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestSessionEchoAndClose(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("needs /bin/sh; the ConPTY side is checked on a real Windows machine")
	}
	s, err := Start(t.TempDir(), 80, 24, "/bin/sh")
	if err != nil {
		t.Fatal(err)
	}
	out := s.Output()
	s.Write([]byte("echo he''llo\n"))
	var got strings.Builder
	deadline := time.After(5 * time.Second)
	for !strings.Contains(got.String(), "hello") {
		select {
		case b := <-out:
			got.Write(b)
		case <-deadline:
			t.Fatalf("no echo, got %q", got.String())
		}
	}
	s.Close()
	for range out { // must close once the shell is gone
	}
}
