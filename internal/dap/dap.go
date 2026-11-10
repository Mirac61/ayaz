// Package dap runs a debug adapter (Delve) as a child process and carries its messages: the adapter listens on a
// TCP port it announces on its first line of output, and speaks the same Content-Length framing as the language
// server protocol, so the frontend gets bare JSON messages like it does for LSP.
package dap

import (
	"bufio"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"regexp"
	"sync"
	"syscall"
	"time"

	"github.com/Mirac61/ayaz/internal/lsp"
)

// listening matches Delve's first line: "DAP server listening at: 127.0.0.1:50432" ([::1]:… for IPv6).
var listening = regexp.MustCompile(`listening at:\s*(\S+)`)

// startTimeout is how long the adapter gets to announce its address.
const startTimeout = 15 * time.Second

// Adapter is one running debug adapter and the connection to it.
type Adapter struct {
	cmd   *exec.Cmd
	conn  net.Conn
	in    *bufio.Reader
	mu    sync.Mutex // serializes Send
	close sync.Once
}

// Start runs `shell -l -c "exec <command>"` in dir (the login shell finds dlv in ~/go/bin even for a Finder-started
// app), waits for the address on its first output line and connects to it.
func Start(dir, shell, command string) (*Adapter, error) {
	return StartWithOutput(dir, shell, command, nil)
}

// StartWithOutput is Start, and passes what the adapter writes after its address line to onOut. For Delve that is the
// debugged program's own stdout: it isn't sent as a DAP output event. onOut runs on the reader's goroutine.
func StartWithOutput(dir, shell, command string, onOut func(string)) (*Adapter, error) {
	cmd := exec.Command(shell, "-l", "-c", "exec "+command)
	cmd.Dir = dir
	cmd.Stderr = os.Stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	kill := func() {
		syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
		cmd.Wait()
	}
	addr := make(chan string, 1)
	go func() {
		r := bufio.NewReader(out)
		for {
			line, err := r.ReadString('\n')
			if m := listening.FindStringSubmatch(line); m != nil {
				addr <- m[1]
				// Leaving the rest unread would block the adapter.
				buf := make([]byte, 4096)
				for {
					n, err := r.Read(buf)
					if n > 0 && onOut != nil {
						onOut(string(buf[:n]))
					}
					if err != nil {
						return
					}
				}
			}
			if err != nil {
				close(addr)
				return
			}
		}
	}()
	select {
	case a, ok := <-addr:
		if !ok {
			kill()
			return nil, errors.New("dap: the adapter ended without announcing an address")
		}
		conn, err := net.DialTimeout("tcp", a, 5*time.Second)
		if err != nil {
			kill()
			return nil, fmt.Errorf("dap: %w", err)
		}
		return &Adapter{cmd: cmd, conn: conn, in: bufio.NewReader(conn)}, nil
	case <-time.After(startTimeout):
		kill()
		return nil, errors.New("dap: the adapter didn't announce an address")
	}
}

// Send frames and writes one JSON message to the adapter.
func (a *Adapter) Send(body []byte) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	return lsp.WriteMessage(a.conn, body)
}

// Recv blocks for the next message; an error means the adapter is gone.
func (a *Adapter) Recv() ([]byte, error) { return lsp.ReadMessage(a.in) }

// Close ends the connection and kills the adapter's process group (the program it debugs goes with it) and waits.
// Safe to call more than once.
func (a *Adapter) Close() {
	a.close.Do(func() {
		a.conn.Close()
		syscall.Kill(-a.cmd.Process.Pid, syscall.SIGTERM)
		a.cmd.Wait()
	})
}
