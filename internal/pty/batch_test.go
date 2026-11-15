package pty

import (
	"testing"
	"time"
)

func run(in chan []byte, window time.Duration, max int) <-chan []byte {
	out := make(chan []byte, 100)
	go func() {
		Batch(in, func(b []byte) error { out <- b; return nil }, window, max)
		close(out)
	}()
	return out
}

func TestFirstChunkAfterIdleIsImmediate(t *testing.T) {
	in := make(chan []byte)
	out := run(in, time.Hour, 1<<20) // a huge window must not delay the echo
	in <- []byte("a")
	select {
	case b := <-out:
		if string(b) != "a" {
			t.Fatalf("got %q", b)
		}
	case <-time.After(time.Second):
		t.Fatal("echo was held back")
	}
	close(in)
}

func TestBurstIsCoalesced(t *testing.T) {
	in := make(chan []byte, 10)
	in <- []byte("1")
	for _, s := range []string{"2", "3", "4"} {
		in <- []byte(s)
	}
	close(in)
	var got []string
	for b := range run(in, 50*time.Millisecond, 1<<20) {
		got = append(got, string(b))
	}
	if len(got) != 2 || got[0] != "1" || got[1] != "234" {
		t.Fatalf("got %q, want [1 234]", got)
	}
}

func TestMaxBytesFlushesEarly(t *testing.T) {
	in := make(chan []byte, 10)
	for _, s := range []string{"x", "aa", "bb", "cc"} {
		in <- []byte(s)
	}
	close(in)
	var got []string
	for b := range run(in, time.Hour, 4) {
		got = append(got, string(b))
	}
	if len(got) != 3 || got[0] != "x" || got[1] != "aabb" || got[2] != "cc" {
		t.Fatalf("got %q, want [x aabb cc]", got)
	}
}
