package proc

import (
	"os"
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

// A re-run of the test binary that never exits stands in for a hanging taskkill.
func TestMain(m *testing.M) {
	if os.Getenv("AYAZ_HANG") == "1" {
		time.Sleep(time.Minute)
		return
	}
	os.Exit(m.Run())
}

func TestKillFallsBackWhenTaskkillHangs(t *testing.T) {
	victim := Command("", "ping -n 60 127.0.0.1")
	if err := victim.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { victim.Wait(); close(done) }()
	t.Cleanup(func() { victim.Process.Kill() })

	oldTimeout, oldPath := taskkillTimeout, taskkillPath
	taskkillTimeout, taskkillPath = 300*time.Millisecond, os.Args[0]
	t.Cleanup(func() { taskkillTimeout, taskkillPath = oldTimeout, oldPath })
	t.Setenv("AYAZ_HANG", "1")

	start := time.Now()
	if err := Kill(victim); err != nil {
		t.Fatalf("fallback Process.Kill failed: %v", err)
	}
	if time.Since(start) < 250*time.Millisecond {
		t.Error("taskkill stand-in returned at once: the timeout path was not exercised")
	}
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("process still running after the fallback")
	}
}
