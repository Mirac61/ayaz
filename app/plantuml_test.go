package app

import (
	"strings"
	"testing"
	"time"

	"github.com/Mirac61/ayaz/internal/proc"
)

func TestRenderPlantUML(t *testing.T) {
	if !proc.Available("", proc.Shell(), "plantuml") {
		t.Skip("plantuml is not installed")
	}
	svg, err := renderPlantUML("@startuml\nAlice -> Bob: hi\n@enduml\n", 60*time.Second)
	if err != nil || !strings.Contains(svg, "<svg") || !strings.Contains(svg, "Alice") {
		t.Fatalf("got %v, %.80q", err, svg)
	}
	// A syntax error still yields a drawing (with the error in it), not a Go error.
	if svg, err = renderPlantUML("@startuml\nnot valid ->\n@enduml\n", 60*time.Second); err != nil || !strings.Contains(svg, "<svg") {
		t.Fatalf("syntax error: %v", err)
	}
}
