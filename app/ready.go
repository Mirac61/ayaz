package app

import (
	"fmt"
	"os"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// started is close enough to process start for a log line; K1 itself is measured from outside with hyperfine.
var started = time.Now()

// OnReady handles "app:ready", sent by the frontend after its first paint.
// Later, indexing, watching and LSP start here (03-performance). With AYAZ_EXIT_ON_READY=1 the app quits, for K1.
func OnReady(a *application.App) {
	a.Event.On("app:ready", func(*application.CustomEvent) {
		fmt.Printf("app:ready after %d ms\n", time.Since(started).Milliseconds())
		if os.Getenv("AYAZ_EXIT_ON_READY") == "1" {
			a.Quit()
		}
	})
}
