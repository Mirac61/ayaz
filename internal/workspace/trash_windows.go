package workspace

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// trash moves p to the Recycle Bin through the shell's own delete, so Explorer can restore it.
func trash(p string) error {
	fi, err := os.Stat(p)
	if err != nil {
		return err
	}
	call := "DeleteFile"
	if fi.IsDir() {
		call = "DeleteDirectory"
	}
	// The path travels in the environment: no quoting of file names in the script.
	script := "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::" + call +
		"($env:AYAZ_TRASH, 'OnlyErrorDialogs', 'SendToRecycleBin')"
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.Env = append(os.Environ(), "AYAZ_TRASH="+p)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("recycle bin: %s", strings.TrimSpace(string(out)+" "+err.Error()))
	}
	return nil
}
