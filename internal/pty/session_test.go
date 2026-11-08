package pty

import (
	"strings"
	"testing"
	"time"
)

func TestSessionEchoAndClose(t *testing.T) {
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
