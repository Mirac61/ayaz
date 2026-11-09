// Package fsserve serves workspace files under /fs/<workspace-id>/<relative path> (ADR-0005).
package fsserve

import (
	"net/http"
	"os"
	"strings"

	"github.com/Mirac61/ayaz/internal/workspace"
)

const prefix = "/fs/"

// Middleware answers /fs/ itself and passes everything else on. ServeContent gives Range, ETag and MIME.
func Middleware(reg *workspace.Registry) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasPrefix(r.URL.Path, prefix) {
				next.ServeHTTP(w, r)
				return
			}
			id, rel, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, prefix), "/")
			ws, err := reg.Get(id)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			p, err := ws.Resolve(rel)
			if err != nil {
				http.NotFound(w, r) // 404, not 403: do not reveal what exists outside
				return
			}
			f, err := os.Open(p)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			defer f.Close()
			st, err := f.Stat()
			if err != nil || st.IsDir() {
				http.NotFound(w, r)
				return
			}
			// Workspace files are data: an SVG or HTML opened by URL must not run scripts in the app's origin.
			w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			http.ServeContent(w, r, st.Name(), st.ModTime(), f)
		})
	}
}
