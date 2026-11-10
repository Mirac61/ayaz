package app

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// ConfigService reads the user's settings from <UserConfigDir>/ayaz/
// (macOS: ~/Library/Application Support/ayaz, Linux: ~/.config/ayaz).
type ConfigService struct{}

// Keymap returns keymap.json as text, "" if there is none. The frontend parses and checks it.
func (ConfigService) Keymap() (string, error) { return readConfig("keymap.json") }

// Settings returns settings.json as text, "" if there is none. The frontend parses and checks it.
func (ConfigService) Settings() (string, error) { return readConfig("settings.json") }

func readConfig(name string) (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(filepath.Join(dir, "ayaz", name))
	if errors.Is(err, fs.ErrNotExist) {
		return "", nil
	}
	return string(b), err
}
