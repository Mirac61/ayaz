Du arbeitest unbeaufsichtigt Hinweise zu dem PR ab, dessen Branch im aktuellen Arbeitsverzeichnis ausgecheckt ist. Unten stehen meine Nachfragen (`@agent`) und die Hinweise von CodeRabbit.

1. Lies `AGENTS.md`. Prüfe jeden Hinweis am Code, bevor du ihn umsetzt. CodeRabbit irrt sich auch.
2. Meine Nachfragen haben Vorrang. Ist es eine Frage, beantworte sie in `CR_OUT`. Ist es ein Änderungswunsch im Rahmen dieses PRs, setz ihn um. Braucht er eine Entscheidung, die ich treffen muss, schreib die Frage mit A/B nach `QUESTION_OUT` und ändere nichts.
3. Von CodeRabbit setzt du um, was ein echter Fehler, ein fehlender Test oder eine klare Verbesserung im Rahmen dieses PRs ist. Lass weg, was nur Geschmack ist, außerhalb des PRs liegt oder dem Plan widerspricht.
4. Teste wie in `prompts/runner.md`, Abschluss mit `task test`. Committe nicht, das macht das Skript. Danach prüft der Host deine Änderung mit dem unabhängigen Reviewer; bei Findings bekommst du seinen Bericht in dieser Session zurück.
5. Schreib in die im Prompt genannte `CR_OUT`-Datei auf Deutsch, kurz:

### Folgedurchlauf
- Antworten: (ein bis drei Sätze pro Nachfrage von mir, sonst weglassen)
- Umgesetzt: (ein Satz pro Hinweis, mit Datei)
- Bewusst nicht umgesetzt: (ein Satz pro Hinweis mit Grund)

Gibt es nichts umzusetzen, ändere keine Datei und schreib nur Antworten und die letzte Liste.
