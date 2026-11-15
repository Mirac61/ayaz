package app

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestParseOpen(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "a.go"), nil, 0o600)
	os.WriteFile(filepath.Join(dir, "odd:7"), nil, 0o600)
	os.Mkdir(filepath.Join(dir, "sub"), 0o700)
	a := filepath.Join(dir, "a.go")
	cases := []struct {
		args []string
		want *OpenRequest
	}{
		{nil, nil},
		{[]string{"sub"}, nil},                                 // a folder is the normal start
		{[]string{"--workspace", "sub"}, nil},                  //
		{[]string{"a.go"}, &OpenRequest{Path: a}},              //
		{[]string{"a.go:12"}, &OpenRequest{Path: a, Line: 12}}, //
		{[]string{"a.go:12:3"}, &OpenRequest{Path: a, Line: 12, Col: 3}},
		{[]string{"--wait", "a.go"}, &OpenRequest{Path: a, Wait: true}},
		{[]string{"new.txt:2"}, &OpenRequest{Path: filepath.Join(dir, "new.txt"), Line: 2}}, // a file to create
		{[]string{"odd:7"}, &OpenRequest{Path: filepath.Join(dir, "odd:7")}},                // the colon is part of the name
		{[]string{"nodir/x.go"}, nil},
	}
	for _, c := range cases {
		if got := ParseOpen(c.args, dir); !reflect.DeepEqual(got, c.want) {
			t.Errorf("ParseOpen(%v) = %+v, want %+v", c.args, got, c.want)
		}
	}
}

// abs is an absolute path on every OS ("/x" has no drive letter on Windows, so the server would drop it).
func abs(p string) string { return filepath.Join(os.TempDir(), filepath.FromSlash(p)) }

func TestSendOpenWaitsForDone(t *testing.T) {
	sock := filepath.Join(os.TempDir(), "ayaz-test-"+filepath.Base(t.TempDir())+".sock")
	if SendOpen(sock, OpenRequest{Path: abs("x")}) {
		t.Fatal("nobody listens yet")
	}
	done := make(chan struct{})
	got := make(chan OpenRequest, 1)
	stop, err := ServeOpen(sock, func(r OpenRequest) <-chan struct{} { got <- r; return done })
	if err != nil {
		t.Fatal(err)
	}
	defer stop()

	if !SendOpen(sock, OpenRequest{Path: abs("x/a.go"), Line: 3}) { // no wait: returns at once
		t.Fatal("not handled")
	}
	if r := <-got; r.Path != abs("x/a.go") || r.Line != 3 {
		t.Fatalf("request = %+v", r)
	}

	returned := make(chan bool)
	go func() { returned <- SendOpen(sock, OpenRequest{Path: abs("x/COMMIT_EDITMSG"), Wait: true}) }()
	<-got
	select {
	case <-returned:
		t.Fatal("--wait returned before the file closed")
	case <-time.After(100 * time.Millisecond):
	}
	close(done)
	if !<-returned {
		t.Fatal("wait ended without an answer")
	}
}

func TestServeOpenReplacesStaleSocket(t *testing.T) {
	sock := filepath.Join(os.TempDir(), "ayaz-test-"+filepath.Base(t.TempDir())+".sock")
	os.WriteFile(sock, nil, 0o600) // a crash left it
	stop, err := ServeOpen(sock, func(OpenRequest) <-chan struct{} { return nil })
	if err != nil {
		t.Fatal(err)
	}
	defer stop()
	if !SendOpen(sock, OpenRequest{Path: abs("x")}) {
		t.Fatal("stale socket was not replaced")
	}
}
