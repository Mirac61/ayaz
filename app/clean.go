package app

import (
	"os"
	"path/filepath"
	"strings"
)

// CleanAppleDouble recursively removes AppleDouble files (._*) and __MACOSX directories
// from an extracted directory so codesign verification succeeds even if an archive contained metadata forks.
func CleanAppleDouble(root string) error {
	return filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		name := info.Name()
		if info.IsDir() && name == "__MACOSX" {
			_ = os.RemoveAll(path)
			return filepath.SkipDir
		}
		if !info.IsDir() && strings.HasPrefix(name, "._") {
			_ = os.Remove(path)
		}
		return nil
	})
}
