package app

import (
	"bytes"
	"errors"
	"strings"
	"time"

	"github.com/Mirac61/ayaz/internal/proc"
)

const plantumlCommand = "plantuml -tsvg -pipe -charset UTF-8 -headless"

// RenderPlantUML renders PlantUML source to SVG with the installed `plantuml` (nothing leaves the machine).
// A diagram with a syntax error still comes back as an SVG: PlantUML draws the error into it.
func (s *WorkspaceService) RenderPlantUML(source string) (string, error) {
	return renderPlantUML(source, 30*time.Second)
}

func renderPlantUML(source string, timeout time.Duration) (string, error) {
	shell := proc.Shell()
	if !proc.Available("", shell, plantumlCommand) {
		return "", errors.New("plantuml is not installed (macOS: brew install plantuml)")
	}
	cmd := proc.Command(shell, plantumlCommand)
	cmd.Stdin = strings.NewReader(source)
	var out, errOut bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errOut
	if err := cmd.Start(); err != nil {
		return "", err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		// plantuml exits non-zero for a drawing with errors but still writes the SVG.
		if !strings.Contains(out.String(), "<svg") {
			msg := strings.TrimSpace(errOut.String())
			if msg == "" && err != nil {
				msg = err.Error()
			}
			return "", errors.New("plantuml failed: " + msg)
		}
		return out.String(), nil
	case <-time.After(timeout):
		_ = proc.Kill(cmd)
		<-done
		return "", errors.New("plantuml took too long")
	}
}
