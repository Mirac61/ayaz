package app

import (
	"bytes"
	"errors"
	"strings"
	"time"

	"github.com/Mirac61/ayaz/internal/proc"
)

const plantumlCommand = "plantuml -tsvg -pipe -charset UTF-8 -headless"

// Every render is a JVM, and a page with many blocks (or typing in one) asks for many at once.
var plantumlSlots = make(chan struct{}, 2)

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
	plantumlSlots <- struct{}{}
	defer func() { <-plantumlSlots }()
	cmd := proc.Command(shell, plantumlCommand)
	// The reading view draws any opened file, so the source is untrusted. PlantUML's default lets !include and
	// %load_json read every local file; SANDBOX blocks files and the network, the bundled <stdlib> still works.
	cmd.Env = append(cmd.Environ(), "PLANTUML_SECURITY_PROFILE=SANDBOX")
	cmd.Stdin = strings.NewReader(source)
	var out, errOut bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errOut
	if err := cmd.Start(); err != nil {
		return "", err
	}
	timer := time.AfterFunc(timeout, func() { _ = proc.Kill(cmd) })
	err := cmd.Wait()
	if !timer.Stop() {
		return "", errors.New("plantuml took too long")
	}
	// plantuml exits non-zero for a drawing with errors but still writes the SVG.
	if !strings.Contains(out.String(), "<svg") {
		msg := strings.TrimSpace(errOut.String())
		if msg == "" && err != nil {
			msg = err.Error()
		}
		return "", errors.New("plantuml failed: " + msg)
	}
	return out.String(), nil
}
