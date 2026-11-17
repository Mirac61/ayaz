// Package acp runs an Agent Client Protocol agent as a child process. ACP over stdio is one JSON message per line,
// so the frontend gets bare JSON messages like it does for LSP and DAP; Go only adds and strips the newline.
package acp

import (
	"bufio"
	"errors"
	"io"
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/Mirac61/ayaz/internal/proc"
)

// MaxMessage caps one incoming line: messages can carry whole files, but a runaway agent must not grow memory.
const MaxMessage = 16 << 20

// ErrNotFound means the agent's program isn't on the user's PATH.
var ErrNotFound = errors.New("acp: command not found")

// ErrTooLong means the agent sent a line above MaxMessage; the stream can't be resynchronized, so close the agent.
var ErrTooLong = errors.New("acp: message exceeds 16 MB")

// Agent is one running agent and its stdio.
type Agent struct {
	cmd   *exec.Cmd
	in    io.WriteCloser
	out   *bufio.Reader
	mu    sync.Mutex // serializes Send
	close sync.Once
}

// Start runs `shell -l -c "exec <command>"` in dir, in its own process group. The login shell finds the agent in the
// user's PATH even for a Finder-started app. The agent's stderr goes to the log, not to the message stream.
func Start(dir, shell, command string) (*Agent, error) {
	if !proc.Available(dir, shell, command) {
		return nil, ErrNotFound
	}
	cmd := proc.Command(shell, command)
	cmd.Dir = dir
	in, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	errOut, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	go func() { // drain to the end: a full stderr pipe would stall the agent. A long line is logged in pieces.
		r := bufio.NewReaderSize(errOut, 4<<10)
		for {
			line, err := r.ReadSlice('\n')
			if len(line) > 0 {
				log.Println("acp:", strings.TrimRight(string(line), "\r\n"))
			}
			if err != nil && err != bufio.ErrBufferFull {
				return
			}
		}
	}()
	return &Agent{cmd: cmd, in: in, out: bufio.NewReaderSize(out, 64<<10)}, nil
}

// Send writes one message plus the newline that ends it. A message must not contain a newline itself (JSON.stringify
// output doesn't).
func (a *Agent) Send(msg []byte) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	_, err := a.in.Write(append(msg[:len(msg):len(msg)], '\n'))
	return err
}

// Recv blocks for the next line; io.EOF means the agent ended, ErrTooLong that it overran MaxMessage.
func (a *Agent) Recv() ([]byte, error) {
	var line []byte
	for {
		chunk, err := a.out.ReadSlice('\n')
		line = append(line, chunk...)
		if len(line) > MaxMessage+1 {
			return nil, ErrTooLong
		}
		if err == bufio.ErrBufferFull {
			continue
		}
		if err != nil {
			return nil, err // a last line without its newline is dropped: it can't be a whole message
		}
		return line[:len(line)-1], nil
	}
}

// killGrace is how long an agent gets to end after SIGTERM before its process group is killed.
var killGrace = 3 * time.Second

// Close ends the agent's process group and waits: SIGTERM first, SIGKILL when the agent ignores it for killGrace.
// Safe to call more than once.
func (a *Agent) Close() {
	a.close.Do(func() {
		a.in.Close()
		proc.Terminate(a.cmd)
		done := make(chan struct{})
		go func() { a.cmd.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(killGrace):
			proc.Kill(a.cmd)
			<-done
		}
	})
}
