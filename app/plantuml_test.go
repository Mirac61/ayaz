package app

import (
	"os"
	"path/filepath"
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
	// A diagram can't pull a local file into the picture.
	secret := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(secret, []byte("DUMMYSECRET"), 0o600); err != nil {
		t.Fatal(err)
	}
	svg, _ = renderPlantUML("@startuml\nAlice -> Bob\nnote right\n!include "+filepath.ToSlash(secret)+"\nend note\n@enduml\n", 60*time.Second)
	if strings.Contains(svg, "DUMMYSECRET") {
		t.Fatal("!include read a local file")
	}
	// A syntax error still yields a drawing (with the error in it), not a Go error.
	if svg, err = renderPlantUML("@startuml\nnot valid ->\n@enduml\n", 60*time.Second); err != nil || !strings.Contains(svg, "<svg") {
		t.Fatalf("syntax error: %v", err)
	}
}
