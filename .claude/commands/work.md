---
description: Waypoint-Task umsetzen, unabhängig reviewen, Findings fixen, committen (kein Push)
argument-hint: "[task-id]"
---

Arbeite einen Task aus der Queue ab — mit verpflichtendem Review vor dem Commit.
Du bist der Umsetzer, der `reviewer` ist die Gegenprüfung.

1. **Task wählen.** Ohne `$ARGUMENTS`: `waypoint -p --json`, ältestes `TODO`.
   Mit ID: genau diesen Task. Gibt es keinen, sag das und stoppe.
2. **Spezifikation lesen.** `AGENTS.md`, den Plan aus `[…]` im Task-Titel und dort
   den Abschnitt zu diesem Task. `waypoint task start <id>`.
3. **Nur bei echten Entscheidungen fragen.** Frag mich höchstens 3 Dinge, wenn
   eine Produkt-/UX-/Architekturentscheidung fehlt, Anforderungen sich
   widersprechen, eine Voraussetzung fehlt oder der Task > 450 Zeilen braucht.
   Alles andere entscheidest du selbst und notierst es unter „Entscheidungen“.
   Sicherheit und Robustheit werden nie stillschweigend aufgeweicht.
4. **Umsetzen.** Kleinste saubere Lösung. Tests direkt neben dem Code. Danach
   `task test`; bei UI/CodeMirror/DOM zusätzlich
   `bun run --cwd frontend test:browser`.
5. **Review.** Erzeuge `git status --short`, `git diff` und für jede neue Datei
   `git diff --no-index /dev/null <datei>`. Starte den `reviewer` über das
   Agent-Tool mit Task, Akzeptanzkriterien, Plan-Auszug und Diff. Schreibe seinen
   Bericht unverändert nach `/tmp/ayaz-review-<id>.md`.
6. **Findings abarbeiten.** BLOCKER und SHOULD-FIX, die klar richtig und im Scope
   sind, behebst du. NITs nur wenn trivial. Tests danach erneut. Bei DECISION:
   stelle mir die Frage mit A/B und stoppe — rate nicht.
7. **Zweite Runde.** Höchstens zwei Review-Runden. Danach muss
   `VERDICT: PASS` dastehen. Sonst: `waypoint task block <id>`, Bericht zeigen,
   keinen Commit.
8. **Commit.** Conventional Commit, ohne Push und ohne `gh` (macht das
   Host-Skript). Kein `DONE` setzen — das passiert nach dem Merge.

Berichte am Ende: Review-Runden, behobene Findings, deine Entscheidungen, was ich
manuell prüfen muss, und was nicht geprüft wurde.
