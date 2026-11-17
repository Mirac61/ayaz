package acp

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/Mirac61/ayaz/internal/proc"
)

// TestMain doubles as the fake agent: the tests re-run this binary with ACP_HELPER set.
func TestMain(m *testing.M) {
	switch os.Getenv("ACP_HELPER") {
	case "echo":
		r := bufio.NewReaderSize(os.Stdin, 1<<20)
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			if strings.Contains(line, `"initialize"`) {
				fmt.Println(`{"id":1,"result":{"protocolVersion":1}}`)
			} else {
				fmt.Print(line)
			}
		}
	case "exit":
		return
	case "stubborn": // ignores SIGTERM and stdin EOF
		signal.Ignore(syscall.SIGTERM)
		select {}
	case "noisy": // a stderr line far above the Scanner limit, then a normal answer
		fmt.Fprint(os.Stderr, strings.Repeat("e", 200<<10), "\n")
		fmt.Println(`{"id":1}`)
		select {}
	case "big":
		fmt.Print(strings.Repeat("x", MaxMessage+10), "\n")
		select {}
	}
	os.Exit(m.Run())
}

func start(t *testing.T, mode string) *Agent {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("the fake agent is started through a POSIX shell")
	}
	t.Setenv("ACP_HELPER", mode)
	a, err := Start(t.TempDir(), "/bin/sh", "'"+os.Args[0]+"'")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(a.Close)
	return a
}

func roundTrip(t *testing.T, a *Agent, msg string) string {
	t.Helper()
	if err := a.Send([]byte(msg)); err != nil {
		t.Fatal(err)
	}
	got, err := a.Recv()
	if err != nil {
		t.Fatal(err)
	}
	return string(got)
}

func TestRoundTrip(t *testing.T) {
	a := start(t, "echo")
	if got := roundTrip(t, a, `{"id":1,"method":"initialize"}`); got != `{"id":1,"result":{"protocolVersion":1}}` {
		t.Errorf("initialize answer: %s", got)
	}
	for _, msg := range []string{`{"id":2,"method":"a"}`, `{"id":3,"text":"ä€"}`} {
		if got := roundTrip(t, a, msg); got != msg {
			t.Errorf("got %s, want %s", got, msg)
		}
	}
}

func TestLargeMessage(t *testing.T) {
	a := start(t, "echo")
	msg := `{"text":"` + strings.Repeat("y", 1<<20) + `"}`
	if got := roundTrip(t, a, msg); got != msg {
		t.Errorf("1 MB message came back changed (%d bytes)", len(got))
	}
}

func TestTooLongLine(t *testing.T) {
	a := start(t, "big")
	if _, err := a.Recv(); !errors.Is(err, ErrTooLong) {
		t.Errorf("got %v, want ErrTooLong", err)
	}
}

func TestCloseEndsProcessAndIsIdempotent(t *testing.T) {
	a := start(t, "echo")
	done := make(chan struct{})
	go func() { a.Close(); a.Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Close didn't return")
	}
	if a.cmd.ProcessState == nil {
		t.Error("process not reaped")
	}
	if err := a.Send([]byte("{}")); err == nil {
		t.Error("Send after Close should fail")
	}
}

func TestEarlyExitGivesEOF(t *testing.T) {
	a := start(t, "exit")
	if _, err := a.Recv(); err != io.EOF {
		t.Errorf("got %v, want io.EOF", err)
	}
}

func TestStartMissingCommand(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX shell")
	}
	if _, err := Start(t.TempDir(), "/bin/sh", "ayaz-no-such-agent --flag"); !errors.Is(err, ErrNotFound) {
		t.Errorf("got %v, want ErrNotFound", err)
	}
}

func TestCloseKillsAgentThatIgnoresSIGTERM(t *testing.T) {
	old := killGrace
	killGrace = 200 * time.Millisecond
	t.Cleanup(func() { killGrace = old })
	a := start(t, "stubborn")
	time.Sleep(200 * time.Millisecond) // let the helper install its signal handler
	done := make(chan struct{})
	go func() { a.Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Close hangs on an agent that ignores SIGTERM")
	}
}

func TestLongStderrLineDoesNotStallAgent(t *testing.T) {
	a := start(t, "noisy")
	got := make(chan error, 1)
	go func() { _, err := a.Recv(); got <- err }()
	select {
	case err := <-got:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("agent blocked on a full stderr pipe")
	}
}

func TestStartResolvesProgramLikeTheShell(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX shell scripts")
	}
	root := t.TempDir()
	spaced := filepath.Join(root, "Agent Tools")
	if err := os.Mkdir(spaced, 0o755); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\nread l\necho '{\"id\":1}'\n"
	for _, p := range []string{filepath.Join(spaced, "agent"), filepath.Join(root, "local-agent")} {
		if err := os.WriteFile(p, []byte(script), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for name, command := range map[string]string{
		"quoted path with a space":  "'" + filepath.Join(spaced, "agent") + "' --stdio",
		"relative to the workspace": "./local-agent",
	} {
		t.Run(name, func(t *testing.T) {
			a, err := Start(root, "/bin/sh", command)
			if err != nil {
				t.Fatal(err)
			}
			defer a.Close()
			if got := roundTrip(t, a, "{}"); got != `{"id":1}` {
				t.Errorf("got %s", got)
			}
		})
	}
}

func TestCloseGivesUpWhenKillFails(t *testing.T) {
	oldGrace, oldKill := killGrace, kill
	killGrace, kill = 200*time.Millisecond, func(*exec.Cmd) error { return errors.New("kill failed") }
	t.Cleanup(func() { killGrace, kill = oldGrace, oldKill })
	a := start(t, "stubborn")
	time.Sleep(200 * time.Millisecond)
	t.Cleanup(func() { proc.Kill(a.cmd) }) // the fake kill left the agent running
	done := make(chan struct{})
	go func() { a.Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Close blocks although the kill failed")
	}
}
