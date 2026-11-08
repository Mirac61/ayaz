package app

import (
	"fmt"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// PingService is the M0 round-trip check (Spike S4) between frontend and Go.
type PingService struct{}

func (PingService) Ping() string { return "pong" }

// Match has the shape a fuzzy finder result will have in M2.
type Match struct {
	Path      string `json:"path"`
	Score     int    `json:"score"`
	Positions []int  `json:"positions"`
}

// Matches returns n fake results, so S4 measures a realistic payload.
func (PingService) Matches(n int) []Match {
	out := make([]Match, n)
	for i := range out {
		out[i] = Match{
			Path:      fmt.Sprintf("internal/workspace/sub%02d/file_%04d_handler.go", i%20, i),
			Score:     1000 - i,
			Positions: []int{0, 1, 2, 9, 10, 18, 19},
		}
	}
	return out
}

// SpikeMode tells the frontend which M0 spike to show: "" (terminal), "s1" (scroll test) or "bench" (S4, S6, S7).
func (PingService) SpikeMode() string { return os.Getenv("AYAZ_SPIKE") }

// Report prints a measurement line from the frontend to stdout, so spikes can be read without the UI.
// With AYAZ_EXIT_AFTER_REPORT=1 the app quits afterwards (for scripted runs).
func (PingService) Report(line string) {
	fmt.Println(line)
	if os.Getenv("AYAZ_EXIT_AFTER_REPORT") == "1" {
		application.Get().Quit()
	}
}
