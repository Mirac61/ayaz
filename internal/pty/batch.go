// Package pty runs shell sessions and batches their output (ADR-0013).
package pty

import "time"

// Batch reads chunks from in and passes them to send, coalesced:
//   - a chunk after idle is sent at once, so a keystroke echo is never held back;
//   - while output keeps coming, chunks are collected for up to window or until max bytes.
//
// It returns when in is closed (after flushing) or send fails.
func Batch(in <-chan []byte, send func([]byte) error, window time.Duration, max int) error {
	for {
		b, ok := <-in
		if !ok {
			return nil
		}
		if err := send(b); err != nil {
			return err
		}
		// Busy: keep batching until a whole window passes without output.
		for {
			buf, open := collect(in, window, max)
			if len(buf) > 0 {
				if err := send(buf); err != nil {
					return err
				}
			}
			if !open {
				return nil
			}
			if len(buf) == 0 {
				break
			}
		}
	}
}

// collect gathers chunks until window ends or max bytes are waiting. open is false once in is closed.
func collect(in <-chan []byte, window time.Duration, max int) (buf []byte, open bool) {
	t := time.NewTimer(window)
	defer t.Stop()
	for len(buf) < max {
		select {
		case b, ok := <-in:
			if !ok {
				return buf, false
			}
			buf = append(buf, b...)
		case <-t.C:
			return buf, true
		}
	}
	return buf, true
}
