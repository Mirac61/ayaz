Du arbeitest unbeaufsichtigt genau diesen einen Task im aktuellen Arbeitsverzeichnis ab.

## 1. Spezifikation prüfen (selbst entscheiden, nur bei Wichtigem fragen)
1. Lies `AGENTS.md`.
2. Wenn im Task-Titel ein Plan-Dokument in eckigen Klammern steht (z. B. `[docs/plans/...]`), lies diese Datei zuerst und suche den Abschnitt zu deinem Task.
3. Falls in `docs/plans/...` ein Abschnitt `### Antwort` unter deinem Task steht, beachte diese Klärung.
4. **Vorgänger-Tasks:** Steht im Prompt eine `BASIS` mit `feat/task-…`, baut dein Branch auf dem offenen PR des Vorgängers auf. Seine Dateien liegen im Arbeitsverzeichnis. Eine Voraussetzung wie „Task X ist in `dev`“ gilt als erfüllt, wenn die Dateien hier sind. Prüfe also das Arbeitsverzeichnis, nicht `origin/dev`.
5. **Kleine Unklarheiten entscheidest du selbst.** Wenn sich etwas leicht rückgängig machen lässt und weder Verhalten für mich noch Architektur festlegt (Benennung, Nummern in Docs, Reihenfolge, welche von zwei gleichwertigen Stellen, ein veralteter Satz im Plan), nimm die naheliegende Variante und schreib sie unter „Entscheidungen“ in den PR-Body. Weicht der Code vom Plan ab, folge dem Code und notiere das ebenso.
6. **Nur hier stoppen:** Wenn eine Produkt- oder Architektur-Entscheidung fehlt, die ich später nur schwer ändern kann, sich Anforderungen echt widersprechen, eine Voraussetzung im Arbeitsverzeichnis fehlt oder der Task mehr als 450 Zeilen Änderung erfordert:
   - Schreibe deine präzise Rückfrage in die im Prompt genannte `QUESTION_OUT`-Datei, mit deiner Empfehlung und den Varianten als A/B.
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
- (2–4 kurze Bulletpoints in normalen Sätzen, was sich für mich ändert)

### Wie wurde getestet?
- (1–3 Bulletpoints: welche Tests neu sind und was grün ist)

### Entscheidungen
- (Nur wenn du etwas selbst entschieden hast: ein Satz pro Punkt mit der Alternative, sonst Abschnitt weglassen)

### Offen
- (Nur wenn etwas rot bleibt: ein Satz pro Problem, sonst Abschnitt weglassen)

### Manual Check (für das Review am Morgen)
- (1–3 Schritte, was ich in der App anklicken/prüfen soll)

Lesbarkeit geht vor Vollständigkeit, ich lese das morgens im Browser:
- Kurze Sätze. Pro Bulletpoint höchstens ein `Code`-Stück (Dateiname oder Wert), keine Testnamen-Ketten, keine Fehlermeldungen oder Expected/Received-Werte im Fließtext.
- Befehle nur als eigener ```bash-Block, nie inline im Satz.
- Schon vorher rote Tests nicht einzeln auflisten, nur zählen („3 bekannte rote e2e-Tests, unverändert“). Neu rote Tests mit Datei:Zeile und einem Satz zur vermuteten Ursache.
- Details, die nur für Debugging taugen, gehören ins Log, nicht in den PR.
