package app

import (
	"bufio"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// OpenRequest is what `ayaz [--wait] file[:line[:col]]` hands to the running app (M53).
type OpenRequest struct {
	Path string `json:"path"` // absolute
	Line int    `json:"line"` // 1-based, 0 = none
	Col  int    `json:"col"`  // 1-based, 0 = none
	Wait bool   `json:"wait"` // the answer comes once the file is closed in the editor, for $EDITOR
}

// ParseOpen reads the command line. nil means it isn't a file request (no argument, or a folder): the normal start.
// "file:12:3" is the file with the cursor at line 12, column 3, unless a file with that colon name exists.
func ParseOpen(args []string, cwd string) *OpenRequest {
	req := OpenRequest{}
	arg := ""
	for i, a := range args {
		switch {
		case a == "--wait" || a == "-w":
			req.Wait = true
		case a == "--workspace":
			return nil
		case !strings.HasPrefix(a, "-") && arg == "" && (i == 0 || args[i-1] != "--workspace"):
			arg = a
		}
	}
	if arg == "" {
		return nil
	}
	abs := func(p string) string {
		if !filepath.IsAbs(p) {
			p = filepath.Join(cwd, p)
		}
		return filepath.Clean(p)
	}
	if st, err := os.Stat(abs(arg)); err == nil {
		if st.IsDir() {
			return nil
		}
		req.Path = abs(arg)
		return &req
	}
	path, line, col := splitLoc(arg)
	if st, err := os.Stat(filepath.Dir(abs(path))); err != nil || !st.IsDir() {
		return nil // neither a file nor a place to create one: leave it to the folder start, which reports it
	}
	req.Path, req.Line, req.Col = abs(path), line, col
	return &req
}

// splitLoc cuts ":line" and ":line:col" off the end.
func splitLoc(arg string) (path string, line, col int) {
	path = arg
	var nums []int
	for len(nums) < 2 {
		i := strings.LastIndex(path, ":")
		if i < 0 {
			break
		}
		n, err := strconv.Atoi(path[i+1:])
		if err != nil || n < 0 {
			break
		}
		nums = append([]int{n}, nums...)
		path = path[:i]
	}
	switch len(nums) {
	case 1:
		line = nums[0]
	case 2:
		line, col = nums[0], nums[1]
	}
	return path, line, col
}

// SocketPath is where the running app listens, in the user cache next to the swaps.
func SocketPath() string {
	dir := os.Getenv("AYAZ_CACHE_DIR")
	if dir == "" {
		c, err := os.UserCacheDir()
		if err != nil {
			return ""
		}
		dir = filepath.Join(c, "ayaz")
	}
	return filepath.Join(dir, "ayaz.sock")
}

// SendOpen asks the running app to open the file. false means nobody listens (start as the app yourself).
// With req.Wait it returns once the app answers, which is when the file was closed.
func SendOpen(sock string, req OpenRequest) bool {
	c, err := net.Dial("unix", sock)
	if err != nil {
		return false
	}
	defer c.Close()
	if json.NewEncoder(c).Encode(req) != nil {
		return false
	}
	_, _ = bufio.NewReader(c).ReadString('\n') // the answer; a dropped connection ends the wait too
	return true
}

// ServeOpen listens on sock; handle gets each request and returns a channel that closes when a waiting client may go.
// The returned func stops listening. A socket nobody answers on is a leftover of a crash and is replaced.
func ServeOpen(sock string, handle func(OpenRequest) <-chan struct{}) (func(), error) {
	if c, err := net.Dial("unix", sock); err == nil {
		c.Close()
		return func() {}, nil // another app instance owns it; this one just doesn't take requests
	}
	if err := os.MkdirAll(filepath.Dir(sock), 0o700); err != nil {
		return nil, err
	}
	_ = os.Remove(sock)
	l, err := net.Listen("unix", sock)
	if err != nil {
		return nil, err
	}
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			go serveOne(c, handle)
		}
	}()
	return func() { l.Close(); os.Remove(sock) }, nil
}

func serveOne(c net.Conn, handle func(OpenRequest) <-chan struct{}) {
	defer c.Close()
	var req OpenRequest
	if json.NewDecoder(bufio.NewReader(c)).Decode(&req) != nil || !filepath.IsAbs(req.Path) {
		return
	}
	done := handle(req)
	if req.Wait && done != nil {
		<-done
	}
	_, _ = c.Write([]byte("ok\n"))
}
