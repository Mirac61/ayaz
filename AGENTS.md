# Ayaz — Regeln für Agenten

## Commands
- Go: `go test -race ./...`
- Frontend Typecheck & Unit-Tests: `bun run --cwd frontend typecheck && bun run --cwd frontend test`
- Frontend Browser-Tests (bei UI/CodeMirror/DOM-Änderungen Pflicht): `bun run --cwd frontend test:browser`
- Frontend Build (Pflicht vor `go test`/`go build` wegen Embed): `bun run --cwd frontend build`
- Schnelles Gesamt-Gate: `task test`

## Harte Verbote
- Niemals `git commit`, `git push` oder `gh` ausführen (übernimmt das Host-Skript).
- Niemals nach `main` pushen oder mergen, keine Tags/Releases/Version-Bumps.
- Niemals bestehende Tests abschwächen, `test.fails` ergänzen oder Assertions löschen, um grün zu werden.
- Niemals `frontend/bun.lock`, `frontend/package.json`, `go.mod` oder `go.sum` ändern.
- Niemals `.waypoint.json` von Hand editieren.
- Niemals Secrets, Tokens oder `.env`-Dateien lesen oder schreiben.

## Stil & Qualität
- UI-Strings, Code-Kommentare und Commit-Subjects auf Englisch; Plan-Docs und PR-Beschreibungen dürfen Deutsch sein.
- Jede Logik-Änderung braucht einen echten Unit-/Browser-Test direkt neben dem Code.
- Kleinste saubere Lösung: Keine ungefragten Refactorings oder Umbenennungen außerhalb des Tasks.

## Bekannte Fallen
- `bun run lint` prüft nur CSS. Verlasse dich auf `bun run --cwd frontend typecheck`.
- `frontend/dist` wird per `//go:embed` in Go eingebunden. Ohne vorhandenen Build schlägt `go test ./...` fehl.
