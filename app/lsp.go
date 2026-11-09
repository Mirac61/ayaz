package app

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/Mirac61/ayaz/internal/lsp"
	"github.com/Mirac61/ayaz/internal/workspace"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Server name (from the frontend's extension table in editor/lsp.ts) → command. A missing binary just ends the stream.
var lspServers = map[string]string{
	"gopls":  "gopls",
	"clangd": "clangd",
	"ts":     "typescript-language-server --stdio",
	"html":   "vscode-html-language-server --stdio",
	"css":    "vscode-css-language-server --stdio",
	"json":   "vscode-json-language-server --stdio",
	"jdtls":  "jdtls",
}

type lspConfig struct {
	WS   string `json:"ws"`
	Lang string `json:"lang"` // the server name
}

// LspStatus is the "lsp:status" event. State "missing": the server isn't installed;
// "nocdb": clangd runs without compile_commands.json, so it guesses the flags.
type LspStatus struct {
	WS      string `json:"ws"`
	Lang    string `json:"lang"`
	State   string `json:"state"`
	Command string `json:"command"`
}

// HandleLSP serves one language server per "lsp" stream connection. Frames are bare JSON in both directions;
// Go adds and strips the Content-Length framing. If the server dies the stream closes and the frontend
// reconnects (shortcut: no shared server per workspace+language, the frontend opens one stream per pair).
func (s *WorkspaceService) HandleLSP(c *application.StreamConn) {
	defer c.Close()
	var cfg lspConfig
	if err := c.ReceiveJSON(&cfg); err != nil {
		return
	}
	command, ok := lspServers[cfg.Lang]
	w, err := s.reg.Get(cfg.WS)
	if !ok || err != nil {
		return
	}
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	bin := strings.Fields(command)[0]
	if !lsp.Available(shell, bin) {
		emitLsp(LspStatus{WS: cfg.WS, Lang: cfg.Lang, State: "missing", Command: bin})
		return
	}
	switch cfg.Lang {
	case "clangd":
		if !hasCompileDB(w.Root) {
			emitLsp(LspStatus{WS: cfg.WS, Lang: cfg.Lang, State: "nocdb", Command: bin})
		}
	case "jdtls":
		// jdtls keeps its index in a data folder per project; outside the project so it doesn't show in the tree.
		cache, _ := os.UserCacheDir()
		sum := sha256.Sum256([]byte(w.Root))
		command += " -data '" + filepath.Join(cache, "ayaz", "jdtls", hex.EncodeToString(sum[:8])) + "'"
	}
	srv, err := lsp.Start(w.Root, shell, command)
	if err != nil {
		log.Println("lsp:", err)
		return
	}
	s.trackServer(srv, true)
	defer s.trackServer(srv, false)
	defer srv.Close()

	go func() {
		for {
			msg, err := srv.Recv()
			if err != nil || c.Send(msg) != nil {
				c.Close() // server exited: tell the frontend
				return
			}
		}
	}()
	for {
		f, err := c.Receive()
		if err != nil || srv.Send(f) != nil {
			return
		}
	}
}

func emitLsp(st LspStatus) {
	if a := application.Get(); a != nil {
		a.Event.Emit("lsp:status", st)
	}
}

// hasCompileDB reports whether clangd will find compile flags: in the root or build/, like clangd looks.
func hasCompileDB(root string) bool {
	for _, p := range []string{"compile_commands.json", "build/compile_commands.json", "compile_flags.txt"} {
		if _, err := os.Stat(filepath.Join(root, p)); err == nil {
			return true
		}
	}
	return false
}

func (s *WorkspaceService) trackServer(srv *lsp.Server, on bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if on {
		s.servers[srv] = true
	} else {
		delete(s.servers, srv)
	}
}

// System headers clangd may jump into; missing ones are skipped by readLibrary.
var cIncludeRoots = []string{
	"/usr/include", "/usr/local/include", "/usr/lib/clang", "/usr/lib/gcc", "/opt/homebrew/include",
	"/Library/Developer/CommandLineTools", "/Applications/Xcode.app/Contents/Developer",
}

// libraryRoots are the folders a jump may lead into outside the workspace: the Go toolchain and module cache,
// and system headers. shortcut: asked once per process; TypeScript's lib.d.ts and jdtls' jdt:// URIs stay out.
var libraryRoots = sync.OnceValue(func() []string {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	out, _ := exec.Command(shell, "-l", "-c", "go env GOROOT GOMODCACHE").Output()
	return append(strings.Fields(string(out)), cIncludeRoots...)
})

// readLibrary reads a file the language server pointed to outside the workspace, only below one of roots.
// The frontend shows it read-only; WriteText still rejects absolute paths.
func readLibrary(roots []string, path string) (workspace.TextFile, error) {
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return workspace.TextFile{}, err
	}
	for _, r := range roots {
		if r, err := filepath.EvalSymlinks(r); err == nil && strings.HasPrefix(real, r+string(filepath.Separator)) {
			b, err := os.ReadFile(real)
			if err != nil {
				return workspace.TextFile{}, err
			}
			st, err := os.Stat(real)
			if err != nil {
				return workspace.TextFile{}, err
			}
			return workspace.TextFile{Path: path, Content: string(b), Mtime: st.ModTime().UnixMicro()}, nil
		}
	}
	return workspace.TextFile{}, workspace.ErrOutside
}
