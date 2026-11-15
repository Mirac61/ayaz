package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCleanAppleDouble(t *testing.T) {
	tmpDir := t.TempDir()

	// Create bundle structure with some AppleDouble files and a __MACOSX directory
	subDir := filepath.Join(tmpDir, "Contents", "MacOS")
	if err := os.MkdirAll(subDir, 0o755); err != nil {
		t.Fatal(err)
	}
	binFile := filepath.Join(subDir, "ayaz")
	if err := os.WriteFile(binFile, []byte("binary"), 0o755); err != nil {
		t.Fatal(err)
	}
	dotFile := filepath.Join(subDir, "._ayaz")
	if err := os.WriteFile(dotFile, []byte("metadata"), 0o644); err != nil {
		t.Fatal(err)
	}
	macOSXDir := filepath.Join(tmpDir, "__MACOSX")
	if err := os.MkdirAll(macOSXDir, 0o755); err != nil {
		t.Fatal(err)
	}
	macOSXFile := filepath.Join(macOSXDir, "._junk")
	if err := os.WriteFile(macOSXFile, []byte("junk"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := CleanAppleDouble(tmpDir); err != nil {
		t.Fatalf("CleanAppleDouble failed: %v", err)
	}

	// Verify binary still exists
	if _, err := os.Stat(binFile); err != nil {
		t.Errorf("binary file should still exist: %v", err)
	}
	// Verify dot file was removed
	if _, err := os.Stat(dotFile); !os.IsNotExist(err) {
		t.Errorf("._ayaz should have been deleted")
	}
	// Verify __MACOSX directory was removed
	if _, err := os.Stat(macOSXDir); !os.IsNotExist(err) {
		t.Errorf("__MACOSX directory should have been deleted")
	}
}
