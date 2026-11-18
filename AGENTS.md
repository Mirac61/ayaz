# Ayaz — Regeln für Agenten

## Commands
- Go: `go test -race ./...`
- Frontend Typecheck & Unit-Tests: `bun run --cwd frontend typecheck && bun run --cwd frontend test`
- Frontend Browser-Tests (bei UI/CodeMirror/DOM-Änderungen Pflicht): `bun run --cwd frontend test:browser`
- Frontend Build (Pflicht vor `go test`/`go build` wegen Embed): `bun run --cwd frontend build`
- Schnelles Gesamt-Gate: `task test`

## Harte Verbote
- Niemals `git push` oder `gh` ausführen (übernimmt das Host-Skript). `git commit` mit sauberen Conventional Commits ist erlaubt.
- Niemals nach `main` pushen oder mergen, keine Tags/Releases/Version-Bumps.
- Niemals bestehende Tests abschwächen, `test.fails` ergänzen oder Assertions löschen, um grün zu werden.
- Niemals `frontend/bun.lock`, `frontend/package.json`, `go.mod` oder `go.sum` ändern.
- Niemals `.waypoint.json` von Hand editieren.
- Niemals Secrets, Tokens oder `.env`-Dateien lesen oder schreiben.

## Stil & Qualität
- UI-Strings, Code-Kommentare und Commit-Subjects auf Englisch; Plan-Docs und PR-Beschreibungen dürfen Deutsch sein.
- Jede Logik-Änderung braucht einen echten Unit-/Browser-Test direkt neben dem Code.
- Unbeaufsichtigte Läufe committen nur mit `VERDICT: PASS` des Reviewers (`.claude/agents/reviewer.md`); Review-Findings werden nie durch Test-Abschwächung „gelöst“.
- UI- und Design-Änderungen (Layout, Optik, Drag & Drop, Dock, Fenster) gehen nur als PR raus und werden erst nach meinem manuellen Test gemergt. Grüne Tests und ein Reviewer-PASS gelten dafür nicht als Nachweis; der PR-Body nennt konkrete Klickschritte unter „Manual Check“.
- Kleinste saubere Lösung: Keine ungefragten Refactorings oder Umbenennungen außerhalb des Tasks.
- Beschreibungen bleiben kurz: PR-Body höchstens 12 Zeilen und 150 Wörter (Template in `prompts/runner.md`, der Night-Runner prüft das), Doku und Kommentare nur so lang wie nötig, keine Wiederholung des Codes.

## Doku
- Wer einen Ordner oder ein Modul anlegt, verschiebt oder entfernt, ändert `docs/02-architecture.md` im selben PR.
- Ändern sich Befehle oder CI, passen `README.md` und `docs/04-testing.md` mit an.

## Bekannte Fallen
- `task lint` prüft Go (golangci-lint) und Frontend (prettier, oxlint mit `curly`), `task fmt` formatiert beides. Dazu `bun run --cwd frontend typecheck`. `bun run --cwd frontend lint:css` (stylelint) ist nicht in CI, weil es noch Altlasten meldet.
- Immer Klammern: `if (x) {\n  return;\n}`, nie `if (x) return;`.
- `frontend/dist` wird per `//go:embed` in Go eingebunden. Ohne vorhandenen Build schlägt `go test ./...` fehl.
