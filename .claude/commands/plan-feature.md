---
description: Feature besprechen, Plan-Doc erstellen und als Waypoint-Tasks anlegen
---
Wir planen ein Feature für Ayaz. Lies zuerst `docs/05-roadmap.md`, `docs/02-architecture.md`, die letzten 2 Dateien in `docs/plans/` und `AGENTS.md`.

Ablauf:
1. Stelle mir höchstens 3 präzise Rückfragen, die die Umsetzung wirklich entscheiden (Scope, Edge-Cases, UI-Verhalten). Keine Fragen, deren Antwort schon in den Docs steht.
2. Skizziere kurz 2 Ansätze mit Vor-/Nachteilen und gib eine klare Empfehlung.
3. Erst wenn ich "schreib das rein" (oder ähnlich) sage:
   - Erstelle `docs/plans/<YYYY-MM-DD>-<slug>-plan.md`.
   - Lege für jeden lieferbaren Schritt mit `waypoint task add "[docs/plans/<YYYY-MM-DD>-<slug>-plan.md] <Kurztitel>"` einen Task an.
   - Gliedere das Plan-Dokument so, dass jeder Task einen eigenen Abschnitt `## Task: <Kurztitel>` hat, der folgende Punkte enthält:
     - **Ziel & betroffene Dateien**
     - **Akzeptanzkriterien** (konkret prüfbar, inkl. welche Tests geschrieben werden müssen)
     - **Manual Check** (was ich morgens in 2 Minuten von Hand anklicken soll)

Regeln für Tasks:
- Ein Task = ein PR = ein in sich geschlossenes Konzept.
- Zielgröße: maximal 200–350 geänderte Zeilen Code. Schneide große Features in 2–4 kleine Tasks.
