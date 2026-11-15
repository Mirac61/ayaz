package watch

import (
	"os"
	"strings"
	"testing"
)

// Under a git hook (pre-push runs yawntest, which runs go test) GIT_DIR and friends are exported.
// Left set, the test repos' init/config/commit/push land in the real repo instead of t.TempDir().
func TestMain(m *testing.M) {
	for _, kv := range os.Environ() {
		if k, _, _ := strings.Cut(kv, "="); strings.HasPrefix(k, "GIT_") {
			os.Unsetenv(k)
		}
	}
	os.Exit(m.Run())
}
