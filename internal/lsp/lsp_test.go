package lsp

import (
	"bufio"
	"bytes"
	"io"
	"os"
	"os/exec"
	"slices"
	"strings"
	"testing"
	"testing/iotest"
	"time"
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

// K16, Go half: framing + pipe + an echo server (cat) and back, 1,000 messages each of 0.2 KB and 200 KB.
// The stream half (WebView ↔ Go) is in docs/perf-log.md (S7). Logs p95; fails only past the 5 ms budget.
func TestK16Framing(t *testing.T) {
	if testing.Short() {
		t.Skip("timing")
	}
	s, err := Start(t.TempDir(), "/bin/sh", "cat")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for _, size := range []int{200, 200_000} {
		msg := []byte(`{"x":"` + strings.Repeat("a", size) + `"}`)
		ds := make([]time.Duration, 1000)
		for i := range ds {
			t0 := time.Now()
			go s.Send(msg) // concurrently, like HandleLSP: 200 KB overfills the pipe while cat waits to write back
			if got, err := s.Recv(); err != nil || len(got) != len(msg) {
				t.Fatalf("echo: %d bytes, %v", len(got), err)
			}
			ds[i] = time.Since(t0)
		}
		slices.Sort(ds)
		p95 := ds[len(ds)*95/100]
		t.Logf("K16 framing %d B: p50 %v, p95 %v", size, ds[len(ds)/2], p95)
		budget := 5 * time.Millisecond
		if os.Getenv("CI") != "" {
			budget *= 5 // shared runners, Windows pipes
		}
		if p95 > budget {
			t.Errorf("p95 %v over the %v budget", p95, budget)
		}
	}
}

// The real thing, when installed: gopls answers initialize through our framing.
func TestGopls(t *testing.T) {
	s, err := Start(t.TempDir(), "/bin/sh", "gopls")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := exec.LookPath("gopls"); err != nil {
		t.Skip("gopls not in PATH")
	}
	if err := s.Send([]byte(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"processId":null,"rootUri":null,"capabilities":{}}}`)); err != nil {
		t.Fatal(err)
	}
	got, err := s.Recv()
	if err != nil || !bytes.Contains(got, []byte(`"capabilities"`)) {
		t.Fatalf("got %.200s, %v", got, err)
	}
}

func TestAvailable(t *testing.T) {
	if !Available("/bin/sh", "cat") || Available("/bin/sh", "no-such-server-xyz") {
		t.Fatal("Available misreports")
	}
}
