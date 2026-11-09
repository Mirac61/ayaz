package lsp

import (
	"bufio"
	"bytes"
	"io"
	"testing"
	"testing/iotest"
)

func TestFramingRoundTrip(t *testing.T) {
	var buf bytes.Buffer
	msgs := []string{`{"a":1}`, `{"text":"ä€ \r\n\r\n"}`, `{}`}
	for _, m := range msgs {
		if err := WriteMessage(&buf, []byte(m)); err != nil {
			t.Fatal(err)
		}
	}
	// One byte per read: split headers and bodies; merged reads are covered by the shared buffer.
	r := bufio.NewReader(iotest.OneByteReader(&buf))
	for _, want := range msgs {
		got, err := ReadMessage(r)
		if err != nil || string(got) != want {
			t.Fatalf("got %q, %v; want %q", got, err, want)
		}
	}
	if _, err := ReadMessage(r); err != io.EOF {
		t.Fatalf("want EOF, got %v", err)
	}
}

func TestReadMessageRejects(t *testing.T) {
	for _, in := range []string{
		"\r\n{}",                              // no Content-Length
		"Content-Length: x\r\n\r\n",           // not a number
		"Content-Length: 99999999999\r\n\r\n", // oversized
		"Content-Length: 5\r\n\r\n{}",         // truncated body
	} {
		if _, err := ReadMessage(bufio.NewReader(bytes.NewReader([]byte(in)))); err == nil {
			t.Errorf("%q: want error", in)
		}
	}
}

// A fake server: cat echoes our frames back, so Send then Recv is the identity.
func TestServerEcho(t *testing.T) {
	s, err := Start(t.TempDir(), "/bin/sh", "cat")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := s.Send([]byte(`{"id":1}`)); err != nil {
		t.Fatal(err)
	}
	got, err := s.Recv()
	if err != nil || string(got) != `{"id":1}` {
		t.Fatalf("got %q, %v", got, err)
	}
	s.Close()
	s.Close()
	if _, err := s.Recv(); err == nil {
		t.Fatal("Recv after Close should fail")
	}
}
