Du arbeitest unbeaufsichtigt genau diesen einen Task im aktuellen Arbeitsverzeichnis ab.

## 1. Spezifikation prüfen (Fragen statt Raten!)
1. Lies `AGENTS.md`.
2. Wenn im Task-Titel ein Plan-Dokument in eckigen Klammern steht (z. B. `[docs/plans/...]`), lies diese Datei zuerst und suche den Abschnitt zu deinem Task.
3. Falls in `docs/plans/...` ein Abschnitt `### Antwort` unter deinem Task steht, beachte diese Klärung.
4. **Stop-Bedingung bei Unklarheit:** Wenn eine Design-/Architektur-Entscheidung fehlt, sich Anforderungen widersprechen oder der Task mehr als 450 Zeilen Änderung erfordert:
   - **Rate nicht!**
   - Schreibe deine präzise Rückfrage an mich in die im Prompt genannte `QUESTION_OUT`-Datei.
   - Beende dich danach sofort, ohne Code zu ändern.

## 2. Umsetzen & Testen (Pflicht!)
Du hast vollen Zugriff auf die Test-Suite. Nutze sie aktiv nach jeder Änderung:
- Implementiere die kleinste saubere Lösung für den Task.
- Backend-Änderung: Schreibe/erweitere Go-Tests (`*_test.go`) und führe `go test -race ./...` aus.
- Frontend-Logik: Schreibe Vitest-Tests und führe `bun run --cwd frontend typecheck && bun run --cwd frontend test` aus.
- UI / CodeMirror / DOM: Führe zusätzlich `bun run --cwd frontend test:browser` aus.
- Abschluss-Prüfung: Führe zwingend `task test` aus.
- Wenn ein Test fehlschlägt und du die Ursache nach 3 Versuchen nicht sauber lösen kannst: Schreibe das Problem in `QUESTION_OUT` und brich ab.

## 3. Übergabe (PR-Body schreiben)
Wenn alle Tests grün sind, schreibe die PR-Beschreibung auf Deutsch in die im Prompt genannte `PR_BODY_FILE`-Datei exakt nach diesem Template:

### Was wurde geändert?
- (2–4 kurze Bulletpoints zur Umsetzung)

### Wie wurde getestet?
- (Nenne die neu geschriebenen/ausgeführten Go-, Unit- oder Browser-Tests)

### Manual Check (für das Review am Morgen)
- (Exakte, kurze Prüfanweisung, was ich in der App anklicken/prüfen soll)
