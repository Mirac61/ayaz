package app

import (
	"context"
	_ "embed"
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"slices"

	"github.com/Mirac61/ayaz/internal/watch"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// ConfigService reads the user's settings from <UserConfigDir>/ayaz/
// (macOS: ~/Library/Application Support/ayaz, Linux: ~/.config/ayaz), or from $AYAZ_CONFIG_DIR (E2E).
type ConfigService struct{}

// ConfigChange is the "config:changed" event payload: settings.json, keymap.json or snippets.json was saved.
type ConfigChange struct {
	File string `json:"file"`
}

// Keymap returns keymap.json as text, "" if there is none. The frontend parses and checks it.
func (ConfigService) Keymap() (string, error) { return readConfig("keymap.json") }

// Settings returns settings.json as text, "" if there is none. The frontend parses and checks it.
func (ConfigService) Settings() (string, error) { return readConfig("settings.json") }

// Snippets returns snippets.json as text, "" if there is none. The frontend parses and checks it.
func (ConfigService) Snippets() (string, error) { return readConfig("snippets.json") }

// The defaults, each explained: what Folder writes when there is no settings.json yet.
//
//go:embed settings.default.json
var defaultSettings []byte

// keymap.json's counterpart: no bindings yet, the format explained.
//
//go:embed keymap.default.json
var defaultKeymap []byte

// snippets.json's counterpart: no snippets yet, the format explained.
//
//go:embed snippets.default.json
var defaultSnippets []byte

// Folder creates the config folder, settings.json, keymap.json and snippets.json (explained) if missing, and returns the folder.
func (ConfigService) Folder() (string, error) {
	dir, err := configDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	// "{\n}\n" is what the first version of Folder wrote: still untouched, so it gets the explained defaults too.
	for name, text := range map[string][]byte{"settings.json": defaultSettings, "keymap.json": defaultKeymap, "snippets.json": defaultSnippets} {
		file := filepath.Join(dir, name)
		if b, err := os.ReadFile(file); err == nil && string(b) != "{\n}\n" {
			continue
		} else if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return "", err
		}
		if err := os.WriteFile(file, text, 0o644); err != nil {
			return "", err
		}
	}
	return dir, nil
}

// DocsFolder writes the in-app docs (file name → Markdown, sent by the frontend) to <config>/docs and returns the folder.
// Written on every call, so the files match the running version. Only plain *.md names are accepted.
func (ConfigService) DocsFolder(files map[string]string) (string, error) {
	dir, err := configDir()
	if err != nil {
		return "", err
	}
	dir = filepath.Join(dir, "docs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	for name, text := range files {
		if name != filepath.Base(name) || filepath.Ext(name) != ".md" {
			return "", errors.New("docs: bad file name " + name)
		}
		if err := os.WriteFile(filepath.Join(dir, name), []byte(text), 0o644); err != nil {
			return "", err
		}
	}
	return dir, nil
}

// OpenSettings opens a window on the config folder with settings.json (Cmd+,), or brings the open one to the front.
func (ConfigService) OpenSettings() {
	a := application.Get()
	if w, ok := a.Window.GetByName("settings"); ok {
		w.UnMinimise()
		w.Show()
		w.Focus()
		return
	}
	NewWindow(a, "settings", "/?settings")
}

// ServiceStartup watches the config folder, so a saved settings.json, keymap.json or snippets.json applies without a restart.
func (ConfigService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	dir, err := configDir()
	if err != nil {
		return nil // no config folder: nothing to watch, the defaults apply
	}
	err = watchConfig(ctx, dir, func(file string) {
		if a := application.Get(); a != nil {
			a.Event.Emit("config:changed", ConfigChange{File: file})
		}
	})
	if err != nil {
		log.Printf("watch config: %v", err)
	}
	return nil
}

// watchConfig calls fn with "settings.json", "keymap.json" or "snippets.json" each time one changes under dir (created if missing).
func watchConfig(ctx context.Context, dir string, fn func(file string)) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if real, err := filepath.EvalSymlinks(dir); err == nil {
		dir = real // macOS: events carry /private/var for /var
	}
	return watch.Start(ctx, dir, func(b watch.Batch) {
		for _, f := range []string{"settings.json", "keymap.json", "snippets.json"} {
			if b.Rescan || slices.Contains(b.Paths, f) {
				fn(f)
			}
		}
	})
}

func configDir() (string, error) {
	if d := os.Getenv("AYAZ_CONFIG_DIR"); d != "" {
		return d, nil
	}
	dir, err := os.UserConfigDir()
	return filepath.Join(dir, "ayaz"), err
}

func readConfig(name string) (string, error) {
	dir, err := configDir()
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(filepath.Join(dir, name))
	if errors.Is(err, fs.ErrNotExist) {
		return "", nil
	}
	return string(b), err
}
