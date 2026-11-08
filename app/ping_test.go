package app

import "testing"

func TestPing(t *testing.T) {
	if got := (PingService{}).Ping(); got != "pong" {
		t.Fatalf("Ping() = %q, want pong", got)
	}
}
