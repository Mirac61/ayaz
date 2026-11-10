package app

import (
	"context"
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

// ConfigChange is the "config:changed" event payload: settings.json or keymap.json was saved.
type ConfigChange struct {
	File string `json:"file"`
}

// Keymap returns keymap.json as text, "" if there is none. The frontend parses and checks it.
func (ConfigService) Keymap() (string, error) { return readConfig("keymap.json") }

// Settings returns settings.json as text, "" if there is none. The frontend parses and checks it.
func (ConfigService) Settings() (string, error) { return readConfig("settings.json") }

// ServiceStartup watches the config folder, so a saved settings.json or keymap.json applies without a restart.
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

// watchConfig calls fn with "settings.json" or "keymap.json" each time one changes under dir (created if missing).
func watchConfig(ctx context.Context, dir string, fn func(file string)) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if real, err := filepath.EvalSymlinks(dir); err == nil {
		dir = real // macOS: events carry /private/var for /var
	}
	return watch.Start(ctx, dir, func(b watch.Batch) {
		for _, f := range []string{"settings.json", "keymap.json"} {
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
