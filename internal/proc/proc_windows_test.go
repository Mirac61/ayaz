package proc

import (
	"testing"
	"time"
)

func TestTerminateEndsTreeAndKillReportsDeadProcess(t *testing.T) {
	cmd := Command("", "ping -n 60 127.0.0.1")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { cmd.Wait(); close(done) }()
	Terminate(cmd)
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("process still running after Terminate")
	}
	if err := Kill(cmd); err == nil {
		t.Error("Kill on an exited process should return the fallback error")
	}
}
