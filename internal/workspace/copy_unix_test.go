//go:build !windows

package workspace

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func TestCopyRestrictiveUmask(t *testing.T) {
	w := newTestWS(t)
	must(t, os.WriteFile(filepath.Join(w.Root, "ro.txt"), []byte("x"), 0o400))
	old := syscall.Umask(0o277) // the copy's creation mode loses owner write and read
	err := w.Copy("ro.txt", "ro2.txt")
	syscall.Umask(old)
	must(t, err)
	must(t, os.Chmod(filepath.Join(w.Root, "ro2.txt"), 0o600)) // read it back whatever the final mode is
	got, err := os.ReadFile(filepath.Join(w.Root, "ro2.txt"))
	must(t, err)
	if string(got) != "x" {
		t.Errorf("content = %q", got)
	}
}
