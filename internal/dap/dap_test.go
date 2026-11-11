package dap

import (
	"bufio"
	"fmt"
	"net"
	"os/exec"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/Mirac61/ayaz/internal/lsp"
)

// fakeAdapter listens, echoes every framed message back with "echo:" in front, and returns the shell command that
// announces its address the way Delve does (plus some noise first).
func fakeAdapter(t *testing.T) string {
	if runtime.GOOS == "windows" {
		t.Skip("the fake adapter is a POSIX sh script")
	}
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { l.Close() })
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			go func() {
				defer c.Close()
				r := bufio.NewReader(c)
				for {
					m, err := lsp.ReadMessage(r)
					if err != nil || lsp.WriteMessage(c, append([]byte("echo:"), m...)) != nil {
						return
					}
				}
			}()
		}
	}()
	// Start runs "exec <command>", so a script goes through sh -c.
	return fmt.Sprintf(`sh -c "echo starting up; echo 'DAP server listening at: %s'; echo more output; echo oops >&2; sleep 30"`, l.Addr())
}

func TestStartConnectsAndCarriesMessages(t *testing.T) {
	a, err := Start(t.TempDir(), "/bin/sh", fakeAdapter(t))
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	for _, msg := range []string{`{"seq":1,"type":"request","command":"initialize"}`, `{"seq":2,"text":"ä€"}`} {
		if err := a.Send([]byte(msg)); err != nil {
			t.Fatal(err)
		}
		got, err := a.Recv()
		if err != nil || string(got) != "echo:"+msg {
			t.Fatalf("got %q, %v", got, err)
		}
	}
}

func TestCloseKillsTheAdapter(t *testing.T) {
	a, err := Start(t.TempDir(), "/bin/sh", fakeAdapter(t))
	if err != nil {
		t.Fatal(err)
	}
	pid := a.cmd.Process.Pid
	a.Close()
	a.Close() // twice is fine
	if err := exec.Command("kill", "-0", fmt.Sprint(pid)).Run(); err == nil {
		t.Fatal("the adapter process is still there after Close")
	}
	if _, err := a.Recv(); err == nil {
		t.Fatal("Recv works after Close")
	}
}

func TestStartFailsWithoutAnAddress(t *testing.T) {
	// The adapter ends without saying where it listens: an error, not a hang.
	start := time.Now()
	if _, err := Start(t.TempDir(), "/bin/sh", `sh -c "echo no address here"`); err == nil || !strings.Contains(err.Error(), "without announcing") {
		t.Fatalf("err = %v", err)
	}
	if time.Since(start) > 5*time.Second {
		t.Fatal("took a timeout to notice")
	}
	if _, err := Start(t.TempDir(), "/bin/sh", "no-such-debugger-binary"); err == nil {
		t.Fatal("a command that fails to run was accepted")
	}
}

// The real Delve, without debugging anything (that needs the system's developer tools access): it announces its
// address the way Start expects, and answers initialize.
func TestRealDelveAnswersInitialize(t *testing.T) {
	if !lsp.Available("/bin/sh", "dlv") {
		t.Skip("dlv not in PATH")
	}
	a, err := Start(t.TempDir(), "/bin/sh", "dlv dap --listen=127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	hello := `{"seq":1,"type":"request","command":"initialize","arguments":{"adapterID":"go","linesStartAt1":true}}`
	if err := a.Send([]byte(hello)); err != nil {
		t.Fatal(err)
	}
	got, err := a.Recv()
	if err != nil || !strings.Contains(string(got), `"command":"initialize"`) || !strings.Contains(string(got), `"success":true`) {
		t.Fatalf("got %s, %v", got, err)
	}
}

// What the adapter writes after its address line (Delve: the debugged program's stdout) reaches onOut as "stdout", what
// it writes on its stderr as "stderr".
func TestStartWithOutputPassesStdoutAndStderr(t *testing.T) {
	got := make(chan string, 8)
	a, err := StartWithOutput(t.TempDir(), "/bin/sh", fakeAdapter(t), func(c, s string) { got <- c + ":" + strings.TrimSpace(s) })
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	want := map[string]bool{"stdout:more output": true, "stderr:oops": true}
	for len(want) > 0 {
		select {
		case s := <-got:
			delete(want, s)
		case <-time.After(5 * time.Second):
			t.Fatalf("missing %v", want)
		}
	}
}
