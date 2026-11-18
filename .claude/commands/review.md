---
description: Unabhängiges Review des aktuellen Diffs (read-only, ändert nichts)
argument-hint: "[fokus]"
---

Prüfe die aktuelle Änderung mit dem `reviewer`-Subagenten. Du selbst reviewst
nicht und änderst nichts.

1. Sammle den vollständigen Stand:
   - `git status --short`
   - `git diff HEAD` (gestaged und unstaged)
   - Für jede neue, untracked Datei: `git diff --no-index /dev/null <datei>`
   Ist der Diff leer, nimm stattdessen `git show HEAD`.
2. Starte den `reviewer` über das Agent-Tool. Übergib Task/Branch, den Diff, die
   Liste neuer Dateien und den Fokus aus `$ARGUMENTS` (falls gesetzt).
3. Gib seinen Bericht unverändert aus. Fasse nichts zusammen und entschärfe
   nichts.

Wenn der Reviewer nicht startet oder kein `VERDICT:` liefert, sag das und brich
ab. Ein fehlendes Urteil ist kein PASS.
