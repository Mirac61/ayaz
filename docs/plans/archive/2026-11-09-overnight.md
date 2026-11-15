# Overnight plan 2026-11-09 (after M5, 8e8d1f4)

For an agent working alone overnight. The user is asleep: no questions, no pushes. Work through the tasks in order, commit each one locally, stop at the stop line.

## Rules

- Read first: `docs/05-roadmap.md` (M5, M6), `docs/adr/0003-markdown-live-preview.md`, `frontend/src/editor/mdlive.ts` and its tests, `frontend/src/shell/Workbench.tsx`.
- Bun is the package manager here (`bun run …`). Don't add dependencies. Everything needed is installed (`@codemirror/*`, `@lezer/*`).
- Match the code style: short functions, one-line comments that say *why*, no abstractions for later. Pure functions return plain data, so Node tests need no DOM (see `mdDecorations`).
- Commit messages are short English titles like `M6: tables as widgets`. **No `Co-Authored-By` line** (the user's rule).
- Before each commit, everything must be green:
  ```sh
  cd frontend && bun run typecheck && bun run test && bun run test:browser
  cd .. && task build:server && cd frontend && bun run e2e
  go test ./...   # only if Go changed
  ```
- If a test fails and you can't fix it within about three attempts, `git stash` or revert that task, write down why in the report, and go on to the next task.
- Never change existing tests just so they pass. Fixing a test that was wrong is fine; note it in the report.
- At the end, write `docs/plans/2026-11-09-report.md`: per task done / partly / skipped, commits, what to check by hand, open questions. Write it in German, short (the user reads it in the morning).

## Task 1: Reading view (M5 addition)

The user asked for it: Markdown with *no* raw line at all, not even the cursor line.

- `mdlive.ts`: a `StateField<boolean>` `reading` plus a `StateEffect` to toggle it. In reading mode `mdDecorations` treats no line as active. `EditorState.readOnly` comes from the field (`EditorState.readOnly.from(field)`), so Vim can move and yank but not edit. Also turn off the active-line highlight there (a theme class on the editor via `EditorView.editorAttributes`, e.g. `cm-reading`).
- Command `md.reading` "Toggle reading view", key `<Space>mr` (normal) in `core/keymap.ts`. In `Editors`, a method that dispatches the effect on the active view. On a non-Markdown buffer: message "Reading view is for Markdown files".
- The status line shows `READ` instead of the Vim mode while reading (via `Status`).
- Tests: Node test that `mdDecorations` hides the cursor line's markers in reading mode. Browser test: toggle, `j` keeps everything rendered, `x` changes nothing, toggle back.
- Roadmap: add the reading view to M5 in `docs/05-roadmap.md` (one bullet, "added 2026-11-09").

## Task 2: M6 blocks that need no file serving

ADR-0003: block widgets come from a `StateField` (a ViewPlugin may not replace line breaks). Same rule as today: a block that holds a cursor or selection shows its raw source. Keep the pure split: a function that returns plain data per block, and a thin layer that turns it into decorations.

In this order, one commit each:

1. **Code blocks**: highlight fenced code with the language of its info string, reusing `lang/registry.ts` (`markdown({ base: markdownLanguage, codeLanguages })`, with `LanguageDescription.of` built from the registry table; don't load a language twice). Code lines get a background line class; fence lines get a dim class (don't hide them, it keeps line heights stable).
2. **Quotes and lists**: hide `> ` outside active lines and give the quote lines a left-border line class. Bullet markers `-`/`*`/`+` show as `•` (a replace widget on the mark only); ordered lists stay as they are.
3. **Task lists**: `- [ ]` / `- [x]` show as a checkbox widget outside active lines. Clicking it toggles the `x` in the document (a normal transaction, so undo works). No new Vim key.
4. **Tables** (GFM): outside the cursor, the whole table becomes an HTML `<table>` widget (StateField, `block: true`, `estimatedHeight` = lines × line height). Cell text via `textContent`, **never** `innerHTML` (Q8: no raw HTML from files). Inline formatting inside cells may stay plain in v1. A cursor moving into the table (j/k) shows the raw source; check that `j` from the line above enters it and `k` from below too.
5. **Horizontal rules**: `---` as a thin line outside active lines.

Tests per step: Node fixtures for the data function (aim for ≥ 30 more in total, same style as `mdlive.test.ts`), one browser test for tables with j/k in and out, and one for the checkbox click. Roadmap: tick off what's done under M6 with a note that images and `fsserve` are still open.

## Task 3: big.md and the K3–K5 check (only if time is left)

- Generate `testdata/big.md` with a small script (5,000 lines, headings, lists, 20 tables, 30 code blocks, 50 image references; see `docs/03-performance.md`). Check the script in, plus the file if it's under 300 KB.
- A browser test that opens it with mdlive, scrolls to the end in steps and fails on an exception or a frame over 50 ms (a coarse check, not the real K5 budget). Log the numbers in `docs/perf-log.md`, marked "headless WebKit, not the app".

## Stop line, don't go past it

- **No** images, no Spike S2, no `fsserve`/ADR-0005. They need the native app on macOS and Hyprland and a security decision by the user.
- **No** M7 (LSP) or later milestones, no UI polish from the Extended list.
- **No** `git push`, no changes to CI, Go modules or `package.json`.
- Done when tasks 1 and 2 are committed and green and the report is written. Task 3 is a bonus.
