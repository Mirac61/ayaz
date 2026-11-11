// Package dap runs a debug adapter (Delve) as a child process and carries its messages: the adapter listens on a
// TCP port it announces on its first line of output, and speaks the same Content-Length framing as the language
// server protocol, so the frontend gets bare JSON messages like it does for LSP.
package dap

import (
	"bufio"
	"errors"
	"fmt"
	"github.com/Mirac61/ayaz/internal/proc"
	"io"
	"net"
	"os"
	"os/exec"
	"regexp"
	"sync"
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
	w     io.WriteCloser
	r     io.Closer
	in    *bufio.Reader
	mu    sync.Mutex // serializes Send
	close sync.Once
}

// Start runs `shell -l -c "exec <command>"` in dir (the login shell finds dlv in ~/go/bin even for a Finder-started
// app), waits for the address on its first output line and connects to it.
func Start(dir, shell, command string) (*Adapter, error) {
	return StartWithOutput(dir, shell, command, nil)
}

// StartWithOutput is Start, and passes what the adapter writes after its address line (category "stdout") and on its
// stderr (category "stderr") to onOut. For Delve that is the debugged program's own output: it isn't sent as a DAP
// output event. onOut runs on the readers' goroutines, once per stream at a time.
func StartWithOutput(dir, shell, command string, onOut func(category, text string)) (*Adapter, error) {
	cmd := proc.Command(shell, command)
	cmd.Dir = dir
	var errOut io.Reader
	if onOut != nil {
		pipe, err := cmd.StderrPipe()
		if err != nil {
			return nil, err
		}
		errOut = pipe
	} else {
		cmd.Stderr = os.Stderr
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	if errOut != nil {
		go forward(errOut, func(text string) { onOut("stderr", text) })
	}
	kill := func() {
		proc.Terminate(cmd)
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
				forward(r, func(text string) {
					if onOut != nil {
						onOut("stdout", text)
					}
				})
				return
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
		return &Adapter{cmd: cmd, w: conn, r: conn, in: bufio.NewReader(conn)}, nil
	case <-time.After(startTimeout):
		kill()
		return nil, errors.New("dap: the adapter didn't announce an address")
	}
}

// StartStdio starts the adapter as a child process and communicates with it over stdin and stdout
// (Content-Length framing, like LSP). What it writes on stderr reaches onOut as "stderr".
func StartStdio(dir, shell, command string, onOut func(category, text string)) (*Adapter, error) {
	cmd := proc.Command(shell, command)
	cmd.Dir = dir
	var errOut io.Reader
	if onOut != nil {
		pipe, err := cmd.StderrPipe()
		if err != nil {
			return nil, err
		}
		errOut = pipe
	} else {
		cmd.Stderr = os.Stderr
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	in, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	if errOut != nil {
		go forward(errOut, func(text string) { onOut("stderr", text) })
	}
	return &Adapter{
		cmd: cmd,
		w:   in,
		r:   out,
		in:  bufio.NewReader(out),
	}, nil
}

// forward reads r to its end and hands every chunk to fn.
func forward(r io.Reader, fn func(string)) {
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			fn(string(buf[:n]))
		}
		if err != nil {
			return
		}
	}
}

// Send frames and writes one JSON message to the adapter.
func (a *Adapter) Send(body []byte) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	return lsp.WriteMessage(a.w, body)
}

// Recv blocks for the next message; an error means the adapter is gone.
func (a *Adapter) Recv() ([]byte, error) { return lsp.ReadMessage(a.in) }

// Close ends the connection and kills the adapter's process group (the program it debugs goes with it) and waits.
// Safe to call more than once.
func (a *Adapter) Close() {
	a.close.Do(func() {
		if a.w != nil {
			a.w.Close()
		}
		if a.r != nil && a.r != a.w {
			a.r.Close()
		}
		proc.Terminate(a.cmd)
		a.cmd.Wait()
	})
}
