package app

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

// UpdateInfo holds details about an available update.
type UpdateInfo struct {
	Available      bool   `json:"available"`
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	ReleaseNotes   string `json:"releaseNotes"`
	PublishedAt    string `json:"publishedAt"`
	Filename       string `json:"filename"`
	AssetSize      int64  `json:"assetSize"`
}

// UpdateService wraps the Wails v3 in-app updater for Ayaz.
type UpdateService struct {
	mu        sync.Mutex
	app       *application.App
	latestRel *updater.Release
	lastInfo  *UpdateInfo
	initErr   error
}

// NewUpdateService creates an uninitialised UpdateService.
func NewUpdateService() *UpdateService {
	return &UpdateService{}
}

// ResolveGitHubToken searches for a GitHub token in the environment or gh CLI.
func ResolveGitHubToken() string {
	if t := os.Getenv("AYAZ_GITHUB_TOKEN"); t != "" {
		return strings.TrimSpace(t)
	}
	if t := os.Getenv("GITHUB_TOKEN"); t != "" {
		return strings.TrimSpace(t)
	}
	// Try gh CLI if installed and authenticated
	cmd := exec.Command("gh", "auth", "token")
	out, err := cmd.Output()
	if err == nil {
		tok := strings.TrimSpace(string(out))
		if tok != "" {
			return tok
		}
	}
	return ""
}

// MatchAsset selects the release asset matching the current operating system and architecture.
func MatchAsset(req updater.CheckRequest, assets []github.ReleaseAsset) int {
	plat := strings.ToLower(req.Platform)
	arch := strings.ToLower(req.Arch)

	for i, a := range assets {
		name := strings.ToLower(a.Name)
		// Skip signatures and sidecars
		if strings.HasSuffix(name, ".sig") || strings.HasSuffix(name, ".asc") ||
			strings.HasSuffix(name, ".txt") || strings.Contains(name, "sha256") {
			continue
		}

		// Platform matching:
		// darwin -> matches "darwin", "macos", "osx"
		// windows -> matches "windows", "win"
		// linux -> matches "linux"
		matchesPlat := false
		switch plat {
		case "darwin":
			matchesPlat = strings.Contains(name, "darwin") || strings.Contains(name, "macos") || strings.Contains(name, "osx")
		case "windows":
			matchesPlat = strings.Contains(name, "windows") || strings.Contains(name, "win")
		case "linux":
			matchesPlat = strings.Contains(name, "linux")
		default:
			matchesPlat = strings.Contains(name, plat)
		}
		if !matchesPlat {
			continue
		}

		// Architecture matching:
		matchesArch := false
		switch arch {
		case "amd64":
			matchesArch = strings.Contains(name, "amd64") || strings.Contains(name, "x86_64") || strings.Contains(name, "x64")
		case "arm64":
			matchesArch = strings.Contains(name, "arm64") || strings.Contains(name, "aarch64")
		default:
			matchesArch = arch == "" || strings.Contains(name, arch)
		}
		if !matchesArch {
			continue
		}

		return i
	}
	return -1
}

// Init configures the Wails v3 app.Updater with GitHub Releases.
func (s *UpdateService) Init(a *application.App) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.app = a

	token := ResolveGitHubToken()
	gh, err := github.New(github.Config{
		Repository:    "Mirac61/ayaz",
		Token:         token,
		ChecksumAsset: "SHA256SUMS",
		AssetMatcher:  MatchAsset,
	})
	if err != nil {
		s.initErr = err
		return err
	}

	err = a.Updater.Init(updater.Config{
		CurrentVersion: AppVersion,
		Providers:      []updater.Provider{gh},
	})
	if err != nil {
		s.initErr = err
		return err
	}
	return nil
}

// CurrentVersion returns the running application version.
func (s *UpdateService) CurrentVersion() string {
	return AppVersion
}

// Check queries GitHub Releases for updates newer than AppVersion.
func (s *UpdateService) Check() (*UpdateInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.app == nil || s.app.Updater == nil {
		return &UpdateInfo{
			Available:      false,
			CurrentVersion: AppVersion,
			LatestVersion:  AppVersion,
		}, nil
	}

	rel, err := s.app.Updater.Check(context.Background())
	if err != nil {
		return &UpdateInfo{
			Available:      false,
			CurrentVersion: AppVersion,
			LatestVersion:  AppVersion,
		}, fmt.Errorf("check for updates failed: %w", err)
	}

	if rel == nil {
		info := &UpdateInfo{
			Available:      false,
			CurrentVersion: AppVersion,
			LatestVersion:  AppVersion,
		}
		s.lastInfo = info
		s.latestRel = nil
		return info, nil
	}

	pubStr := ""
	if !rel.PublishedAt.IsZero() {
		pubStr = rel.PublishedAt.Format("2006-01-02 15:04:05")
	}

	info := &UpdateInfo{
		Available:      true,
		CurrentVersion: AppVersion,
		LatestVersion:  rel.Version,
		ReleaseNotes:   rel.Notes,
		PublishedAt:    pubStr,
		Filename:       rel.Artifact.Filename,
		AssetSize:      rel.Artifact.Size,
	}
	s.latestRel = rel
	s.lastInfo = info

	if s.app != nil {
		s.app.Event.Emit("ayaz:updater:available", info)
	}

	return info, nil
}

// DownloadAndInstall downloads the update artifact, verifies its checksum, and stages it.
func (s *UpdateService) DownloadAndInstall() error {
	s.mu.Lock()
	a := s.app
	s.mu.Unlock()

	if a == nil || a.Updater == nil {
		return fmt.Errorf("updater not initialized")
	}

	if err := a.Updater.DownloadAndInstall(context.Background()); err != nil {
		return err
	}
	if p := a.Updater.DownloadedPath(); p != "" {
		_ = CleanAppleDouble(p)
	}
	return nil
}

// Restart executes the atomic binary swap and restarts Ayaz into the new version.
func (s *UpdateService) Restart() error {
	s.mu.Lock()
	a := s.app
	s.mu.Unlock()

	if a == nil || a.Updater == nil {
		return fmt.Errorf("updater not initialized")
	}

	return a.Updater.Restart(context.Background())
}
