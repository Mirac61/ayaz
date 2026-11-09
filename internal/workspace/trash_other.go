//go:build !darwin

package workspace

import (
	"fmt"
	"os/exec"
	"strings"
)

// gio implements the freedesktop trash spec, so file managers can restore the file.
func trash(p string) error {
	out, err := exec.Command("gio", "trash", "--", p).CombinedOutput()
	if err != nil {
		return fmt.Errorf("gio trash: %s", strings.TrimSpace(string(out)+" "+err.Error()))
	}
	return nil
}
