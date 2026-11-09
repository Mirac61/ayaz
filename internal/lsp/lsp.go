// Package lsp runs a language server as a child process and translates between its
// Content-Length framed stdio and bare JSON messages (what @codemirror/lsp-client sends).
package lsp

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"syscall"
)

const maxMessage = 64 << 20 // a server that claims more is broken; don't allocate it

// ReadMessage reads one framed message and returns its JSON body.
func ReadMessage(r *bufio.Reader) ([]byte, error) {
	n := -1
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return nil, err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break
		}
		if k, v, ok := strings.Cut(line, ":"); ok && strings.EqualFold(k, "Content-Length") {
			if n, err = strconv.Atoi(strings.TrimSpace(v)); err != nil {
				return nil, fmt.Errorf("lsp: bad Content-Length %q", v)
			}
		}
	}
	if n < 0 || n > maxMessage {
		return nil, errors.New("lsp: missing or oversized Content-Length")
	}
	body := make([]byte, n)
	_, err := io.ReadFull(r, body)
	return body, err
}

// WriteMessage frames body and writes it in one call, so concurrent writers can't interleave.
func WriteMessage(w io.Writer, body []byte) error {
	var b bytes.Buffer
	fmt.Fprintf(&b, "Content-Length: %d\r\n\r\n", len(body))
	b.Write(body)
	_, err := w.Write(b.Bytes())
	return err
}

// Server is one running language server.
type Server struct {
	cmd   *exec.Cmd
	in    io.WriteCloser
	out   *bufio.Reader
	mu    sync.Mutex // serializes Send
	close sync.Once
}

// Start runs `shell -l -c "exec <command>"` in dir. The login shell finds servers in the user's PATH
// (~/go/bin, Homebrew) even when a Finder-started app has a bare one.
func Start(dir, shell, command string) (*Server, error) {
	cmd := exec.Command(shell, "-l", "-c", "exec "+command)
	cmd.Dir = dir
	cmd.Stderr = os.Stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	in, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return &Server{cmd: cmd, in: in, out: bufio.NewReader(out)}, nil
}

// Send frames and writes one JSON message to the server.
func (s *Server) Send(body []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return WriteMessage(s.in, body)
}

// Recv blocks for the next message; an error means the server is gone.
func (s *Server) Recv() ([]byte, error) { return ReadMessage(s.out) }

// Close kills the server's process group and waits. Safe to call more than once.
func (s *Server) Close() {
	s.close.Do(func() {
		syscall.Kill(-s.cmd.Process.Pid, syscall.SIGTERM)
		s.in.Close()
		s.cmd.Wait()
	})
}
