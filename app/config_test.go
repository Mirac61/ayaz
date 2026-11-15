package app

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWatchConfigReportsSavedFiles(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "ayaz") // missing: watchConfig creates it
	ctx := t.Context()
	got := make(chan string, 8)
	if err := watchConfig(ctx, dir, func(f string) { got <- f }); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	os.WriteFile(filepath.Join(dir, "other.txt"), []byte("x"), 0o644)
	os.WriteFile(filepath.Join(dir, "keymap.json"), []byte("[]"), 0o644)
	os.WriteFile(filepath.Join(dir, "snippets.json"), []byte("{}"), 0o644)
	seen := map[string]bool{}
	for !seen["keymap.json"] || !seen["snippets.json"] {
		select {
		case f := <-got:
			seen[f] = true
		case <-time.After(2 * time.Second):
			t.Fatalf("changes reported: %v, want keymap.json and snippets.json", seen)
		}
	}
}

func TestFolderCreatesSettingsOnce(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "ayaz")
	t.Setenv("AYAZ_CONFIG_DIR", dir)
	got, err := ConfigService{}.Folder()
	if err != nil || got != dir {
		t.Fatalf("Folder() = %q, %v", got, err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "settings.json")); string(b) != string(defaultSettings) {
		t.Fatalf("settings.json = %q", b)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "keymap.json")); string(b) != string(defaultKeymap) {
		t.Fatalf("keymap.json = %q", b)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "snippets.json")); string(b) != string(defaultSnippets) {
		t.Fatalf("snippets.json = %q", b)
	}
	if err := os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{"fontSize": 14}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := (ConfigService{}).Folder(); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "settings.json")); string(b) != `{"fontSize": 14}` {
		t.Fatalf("Folder overwrote settings.json: %q", b)
	}
}

func TestFolderFillsTheOldEmptySettings(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("AYAZ_CONFIG_DIR", dir)
	if err := os.WriteFile(filepath.Join(dir, "settings.json"), []byte("{\n}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := (ConfigService{}).Folder(); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "settings.json")); string(b) != string(defaultSettings) {
		t.Fatalf("settings.json = %q", b)
	}
}

func TestDocsFolderWritesMarkdownOnly(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("AYAZ_CONFIG_DIR", dir)
	got, err := ConfigService{}.DocsFolder(map[string]string{"index.md": "# Docs\n"})
	if err != nil || got != filepath.Join(dir, "docs") {
		t.Fatalf("DocsFolder() = %q, %v", got, err)
	}
	if b, _ := os.ReadFile(filepath.Join(got, "index.md")); string(b) != "# Docs\n" {
		t.Fatalf("index.md = %q", b)
	}
	for _, bad := range []string{"../x.md", "a/b.md", "x.txt"} {
		if _, err := (ConfigService{}).DocsFolder(map[string]string{bad: ""}); err == nil {
			t.Fatalf("DocsFolder accepted %q", bad)
		}
	}
}
