package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// shortcut: a plain move into ~/.Trash, so Finder's "Put Back" doesn't know the origin; use NSFileManager trashItem if missed.
func trash(p string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	dst := filepath.Join(home, ".Trash", filepath.Base(p))
	if _, err := os.Lstat(dst); err == nil {
		dst = fmt.Sprintf("%s %s", dst, time.Now().Format("15.04.05.000"))
	}
	return os.Rename(p, dst)
}
