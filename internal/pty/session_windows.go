package pty

import (
	"context"
	"sync"
	"syscall"

	"github.com/UserExistsError/conpty"
)

// Session is one shell on a Windows pseudo console (ConPTY).
type Session struct {
	cpty  *conpty.ConPty
	close sync.Once
}

// Start runs shell (with args) in dir on a new pseudo console of the given size.
func Start(dir string, cols, rows uint16, shell string, args ...string) (*Session, error) {
	line := syscall.EscapeArg(shell)
	for _, a := range args {
		line += " " + syscall.EscapeArg(a)
	}
	c, err := conpty.Start(line, conpty.ConPtyDimensions(int(cols), int(rows)), conpty.ConPtyWorkDir(dir))
	if err != nil {
		return nil, err
	}
	return &Session{cpty: c}, nil
}

// Output streams reads until the shell exits; the channel is closed then.
func (s *Session) Output() <-chan []byte {
	ch := make(chan []byte, 64)
	go func() {
		defer close(ch)
		for {
			b := make([]byte, 32<<10)
			n, err := s.cpty.Read(b)
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

func (s *Session) Write(b []byte) (int, error) { return s.cpty.Write(b) }

func (s *Session) Resize(cols, rows uint16) error { return s.cpty.Resize(int(cols), int(rows)) }

// Close ends the pseudo console, which ends the shell with it. Safe to call more than once and concurrently.
func (s *Session) Close() {
	s.close.Do(func() {
		s.cpty.Close()
		s.cpty.Wait(context.Background())
	})
}
