package pty

import (
	"os"
	"os/exec"
	"syscall"

	"github.com/creack/pty"
)

// Session is one shell on a pseudo terminal.
type Session struct {
	cmd *exec.Cmd
	tty *os.File
}

// Start runs shell (with args) in dir on a new PTY of the given size.
func Start(dir string, cols, rows uint16, shell string, args ...string) (*Session, error) {
	cmd := exec.Command(shell, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	tty, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		return nil, err
	}
	return &Session{cmd: cmd, tty: tty}, nil
}

// Output streams PTY reads until the shell exits; the channel is closed then.
func (s *Session) Output() <-chan []byte {
	ch := make(chan []byte, 64)
	go func() {
		defer close(ch)
		for {
			b := make([]byte, 32<<10)
			n, err := s.tty.Read(b)
			if n > 0 {
				ch <- b[:n]
			}
			if err != nil {
				return
			}
		}
	}()
	return ch
}

func (s *Session) Write(b []byte) (int, error) { return s.tty.Write(b) }

func (s *Session) Resize(cols, rows uint16) error {
	return pty.Setsize(s.tty, &pty.Winsize{Cols: cols, Rows: rows})
}

// Close hangs up the whole process group (the shell and everything it started) and waits for the shell.
func (s *Session) Close() {
	// pty.Start runs the shell with Setsid, so its pid is the process group id.
	syscall.Kill(-s.cmd.Process.Pid, syscall.SIGHUP)
	s.tty.Close()
	s.cmd.Wait()
}
