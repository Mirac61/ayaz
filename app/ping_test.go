package app

import "testing"

func TestPing(t *testing.T) {
	if got := (PingService{}).Ping(); got != "pong" {
		t.Fatalf("Ping() = %q, want pong", got)
	}
}

func TestMatches(t *testing.T) {
	m := (PingService{}).Matches(50)
	if len(m) != 50 || m[0].Score <= m[49].Score {
		t.Fatalf("Matches(50): len=%d, scores %d..%d", len(m), m[0].Score, m[49].Score)
	}
}
