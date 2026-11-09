package fsserve

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/Mirac61/ayaz/internal/workspace"
)

func TestServe(t *testing.T) {
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, "a.txt"), []byte("0123456789"), 0o644)
	secret := filepath.Join(t.TempDir(), "secret")
	os.WriteFile(secret, []byte("x"), 0o644)
	os.Symlink(secret, filepath.Join(root, "link"))
	os.Mkdir(filepath.Join(root, "d"), 0o755)

	reg := workspace.NewRegistry()
	w, err := reg.Open(root)
	if err != nil {
		t.Fatal(err)
	}
	h := Middleware(reg)(http.HandlerFunc(func(rw http.ResponseWriter, _ *http.Request) { rw.WriteHeader(418) }))

	get := func(path, rng string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", path, nil)
		if rng != "" {
			req.Header.Set("Range", rng)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	if c := get("/fs/"+w.ID+"/a.txt", "").Code; c != 200 {
		t.Errorf("file: %d", c)
	}
	if r := get("/fs/"+w.ID+"/a.txt", "bytes=2-4"); r.Code != 206 || r.Body.String() != "234" {
		t.Errorf("range: %d %q", r.Code, r.Body.String())
	}
	for _, p := range []string{"/fs/" + w.ID + "/../x", "/fs/" + w.ID + "/link", "/fs/" + w.ID + "/d", "/fs/nope/a.txt", "/fs/" + w.ID + "/missing", "/fs/"} {
		if c := get(p, "").Code; c != 404 {
			t.Errorf("%s: %d, want 404", p, c)
		}
	}
	if c := get("/index.html", "").Code; c != 418 {
		t.Errorf("passthrough: %d", c)
	}
}

func FuzzPath(f *testing.F) {
	root := f.TempDir()
	reg := workspace.NewRegistry()
	w, _ := reg.Open(root)
	h := Middleware(reg)(http.NotFoundHandler())
	for _, s := range []string{"a", "../a", "%2e%2e/a", "a/../../b", "\x00"} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, p string) {
		req, err := http.NewRequest("GET", "/fs/"+w.ID+"/x", nil)
		if err != nil {
			t.Skip()
		}
		req.URL.Path = "/fs/" + w.ID + "/" + p
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code == 200 {
			t.Errorf("served %q from an empty workspace", p)
		}
	})
}
