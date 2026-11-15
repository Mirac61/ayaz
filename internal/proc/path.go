package proc

import (
	"bufio"
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// quoteShell returns s wrapped in single quotes with existing single quotes escaped.
func quoteShell(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// detectMasonPaths checks for Mason binary directories (Neovim LSP manager).
func detectMasonPaths(home string) []string {
	var paths []string
	if home != "" {
		paths = append(paths, filepath.Join(home, ".local", "share", "nvim", "mason", "bin"))
	}
	if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
		paths = append(paths, filepath.Join(xdg, "nvim", "mason", "bin"))
	}
	return filterExistingDirs(paths)
}

// detectMisePaths checks for mise (rtx) shims and bins.
func detectMisePaths(home string) []string {
	var paths []string
	if home != "" {
		paths = append(paths,
			filepath.Join(home, ".local", "share", "mise", "shims"),
			filepath.Join(home, ".local", "bin"),
		)
	}
	if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
		paths = append(paths, filepath.Join(xdg, "mise", "shims"))
	}
	return filterExistingDirs(paths)
}

// detectNvmPaths checks for NVM node versions and shims.
func detectNvmPaths(home string) []string {
	nvmDir := os.Getenv("NVM_DIR")
	if nvmDir == "" && home != "" {
		nvmDir = filepath.Join(home, ".nvm")
	}
	if nvmDir == "" {
		return nil
	}

	var paths []string
	currentBin := filepath.Join(nvmDir, "current", "bin")
	if isDir(currentBin) {
		paths = append(paths, currentBin)
	}

	// Check default alias
	defaultAlias := filepath.Join(nvmDir, "alias", "default")
	var defaultVer string
	if data, err := os.ReadFile(defaultAlias); err == nil {
		defaultVer = strings.TrimSpace(string(data))
	}

	nodeDir := filepath.Join(nvmDir, "versions", "node")
	if entries, err := os.ReadDir(nodeDir); err == nil {
		var versions []string
		for _, e := range entries {
			if e.IsDir() {
				versions = append(versions, e.Name())
			}
		}
		// Sort versions descending (e.g. v22 before v20)
		sort.Slice(versions, func(i, j int) bool {
			return versions[i] > versions[j]
		})

		// Put defaultVer first if matched
		if defaultVer != "" {
			for i, v := range versions {
				if v == defaultVer || strings.HasPrefix(v, defaultVer) {
					versions = append([]string{v}, append(versions[:i], versions[i+1:]...)...)
					break
				}
			}
		}

		for _, v := range versions {
			binDir := filepath.Join(nodeDir, v, "bin")
			if isDir(binDir) {
				paths = append(paths, binDir)
			}
		}
	}

	return filterExistingDirs(paths)
}

// detectBrewPaths checks standard Homebrew and Linuxbrew installation prefixes.
func detectBrewPaths(home string) []string {
	var paths []string
	paths = append(paths,
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/local/sbin",
		"/home/linuxbrew/.linuxbrew/bin",
		"/home/linuxbrew/.linuxbrew/sbin",
	)
	if home != "" {
		paths = append(paths,
			filepath.Join(home, ".linuxbrew", "bin"),
			filepath.Join(home, ".linuxbrew", "sbin"),
		)
	}
	return filterExistingDirs(paths)
}

// detectZshrcPaths attempts to run zsh interactively to resolve the user's complete PATH from .zshrc,
// falling back to static parsing of ~/.zshrc if zsh fails or times out.
func detectZshrcPaths(home string) []string {
	if home == "" {
		return nil
	}
	zshrcFile := filepath.Join(home, ".zshrc")
	if _, err := os.Stat(zshrcFile); err != nil {
		return nil
	}

	// Method A: Run zsh -i -c 'printf ...' with timeout
	paths := queryShellPath("zsh")
	if len(paths) > 0 {
		return filterExistingDirs(paths)
	}

	// Method B: Static parsing fallback
	if data, err := os.ReadFile(zshrcFile); err == nil {
		return filterExistingDirs(parseZshrcPaths(string(data), home))
	}
	return nil
}

// queryShellPath runs the specified shell in interactive mode to get $PATH.
func queryShellPath(shell string) []string {
	ctx, cancel := context.WithTimeout(context.Background(), 1200*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, shell, "-i", "-c", `printf "__AYAZ_PATH__%s__AYAZ_PATH__" "$PATH"`)
	cmd.Stdin = nil
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = nil

	if err := cmd.Run(); err != nil {
		return nil
	}

	out := stdout.String()
	start := strings.Index(out, "__AYAZ_PATH__")
	if start == -1 {
		return nil
	}
	start += len("__AYAZ_PATH__")
	end := strings.Index(out[start:], "__AYAZ_PATH__")
	if end == -1 {
		return nil
	}

	rawPath := out[start : start+end]
	var res []string
	for _, p := range strings.Split(rawPath, string(os.PathListSeparator)) {
		p = strings.TrimSpace(p)
		if p != "" {
			res = append(res, p)
		}
	}
	return res
}

var (
	exportPathRegex = regexp.MustCompile(`(?:export\s+)?PATH\s*=\s*["']?([^"'\n]+)["']?`)
	pathArrayRegex  = regexp.MustCompile(`path\s*\+?=\s*\(\s*([^)]+)\s*\)`)
)

// parseZshrcPaths parses lines like PATH="..." or path+=(...) in zshrc text.
func parseZshrcPaths(content string, home string) []string {
	var paths []string
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "#") {
			continue
		}

		if m := exportPathRegex.FindStringSubmatch(line); len(m) > 1 {
			parts := strings.Split(m[1], ":")
			for _, part := range parts {
				part = strings.TrimSpace(part)
				if part == "" || part == "$PATH" || part == "${PATH}" {
					continue
				}
				resolved := expandHome(part, home)
				if resolved != "" {
					paths = append(paths, resolved)
				}
			}
		}

		if m := pathArrayRegex.FindStringSubmatch(line); len(m) > 1 {
			fields := strings.Fields(m[1])
			for _, f := range fields {
				f = strings.Trim(f, `"'`)
				if f == "" || f == "$path" || f == "${path}" {
					continue
				}
				resolved := expandHome(f, home)
				if resolved != "" {
					paths = append(paths, resolved)
				}
			}
		}
	}
	return paths
}

func expandHome(path string, home string) string {
	if strings.HasPrefix(path, "~/") {
		return filepath.Join(home, path[2:])
	}
	if strings.HasPrefix(path, "$HOME/") {
		return filepath.Join(home, path[6:])
	}
	if strings.HasPrefix(path, "${HOME}/") {
		return filepath.Join(home, path[8:])
	}
	if strings.Contains(path, "$") {
		return "" // skip complex shell variable expansions in static parser
	}
	return filepath.Clean(path)
}

func isDir(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

func filterExistingDirs(paths []string) []string {
	var res []string
	seen := make(map[string]bool)
	for _, p := range paths {
		cleaned := filepath.Clean(p)
		if cleaned != "" && !seen[cleaned] && isDir(cleaned) {
			seen[cleaned] = true
			res = append(res, cleaned)
		}
	}
	return res
}

// DiscoverDeveloperPaths collects binary directories from .zshrc, Mason, mise, nvm, brew and standard tool paths.
func DiscoverDeveloperPaths() []string {
	home, _ := os.UserHomeDir()
	var candidates []string

	// 1. Zshrc paths (highest priority: user's personal shell configuration)
	candidates = append(candidates, detectZshrcPaths(home)...)

	// 2. Mason paths (~/.local/share/nvim/mason/bin)
	candidates = append(candidates, detectMasonPaths(home)...)

	// 3. mise paths (~/.local/share/mise/shims)
	candidates = append(candidates, detectMisePaths(home)...)

	// 4. nvm paths (~/.nvm/versions/node/*/bin)
	candidates = append(candidates, detectNvmPaths(home)...)

	// 5. brew paths (/opt/homebrew/bin, etc.)
	candidates = append(candidates, detectBrewPaths(home)...)

	// 6. Windows-specific package managers (Scoop, Mason on Windows)
	if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
		candidates = append(candidates,
			filepath.Join(localAppData, "nvim-data", "mason", "bin"),
			filepath.Join(localAppData, "mise", "shims"),
		)
	}
	if home != "" {
		candidates = append(candidates,
			filepath.Join(home, "scoop", "shims"),
			filepath.Join(home, "scoop", "apps"),
		)
	}

	// 7. Common developer bin directories
	if home != "" {
		candidates = append(candidates,
			filepath.Join(home, "go", "bin"),
			filepath.Join(home, ".cargo", "bin"),
			filepath.Join(home, ".bun", "bin"),
			filepath.Join(home, ".local", "bin"),
			filepath.Join(home, "bin"),
		)
	}

	return filterExistingDirs(candidates)
}

// EnrichPath computes a new PATH containing all discovered developer paths prepended to the current PATH.
func EnrichPath(currentPath string) string {
	discovered := DiscoverDeveloperPaths()
	var existing []string
	seen := make(map[string]bool)

	// Add discovered paths first
	var result []string
	for _, p := range discovered {
		if !seen[p] {
			seen[p] = true
			result = append(result, p)
		}
	}

	// Add existing paths
	for _, p := range strings.Split(currentPath, string(os.PathListSeparator)) {
		cleaned := filepath.Clean(strings.TrimSpace(p))
		if cleaned != "" && !seen[cleaned] {
			seen[cleaned] = true
			existing = append(existing, cleaned)
		}
	}

	result = append(result, existing...)
	return strings.Join(result, string(os.PathListSeparator))
}
