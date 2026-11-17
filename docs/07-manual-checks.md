# 07 – Manual checks

Updated 2026-11-17

What no automated test reaches: the native window, system dialogs, the real clipboard, other shells and servers, and the Hyprland machine. Tick them off here; a finding goes to the milestone's "Still open" in `05-roadmap.md`.

## macOS app (`task darwin:package`, then `bin/ayaz.app`)

| Check | From |
|---|---|
| `ayaz file:12` from a terminal while the app runs: opens in the window with that folder, a second folder gets its own window | M53 |
| `EDITOR="ayaz --wait" git commit` blocks until `:q` on the message, and the commit goes through | M53 |
| A new terminal split opens in the folder the focused shell is in (needs OSC 7 from the shell: `precmd` hook, or mysh) | M53 |
| Semantic colours on a real Go, C, TypeScript and Java file; typing stays smooth in a 5,000-line file | M54 |
| `+` / `-` grow and shrink the selection in Go and TypeScript; `vaf`, `dia`, `]f` feel right in real code | M55 |
| Sticky rows while scrolling a long function; a click on one jumps there | M57 |
| `<Space>ci` / `<Space>co` on a function with real callers (gopls, clangd, TypeScript) | M58 |
| Auto-import through completion in Go and TypeScript; `snippets.json` edited in the settings window applies at once | M59 |
| `<Space>gb`, `<Space>hs` / `<Space>hu` in a repository with real history; lazygit shows the same index | M60, M61 |
| A real `git merge` with conflicts: colours, `]x`, `<Space>mo` / `mt` / `mb`, then `git add` | M62 |
| `"+y` and `"+p` with the system clipboard (headless WebKit denies it) | M63 |
| Trash puts files in `~/.Trash`; zoom with xterm and PDF open; fS latency in a big project; wrap in Markdown | M15–M31 |
| The picker preview (`<Space>ff`, `<Space>fw`) in the real window: scrolling the list with `<C-n>` held stays smooth; colors follow the theme | M65 |
| Right click on a tree row and on a tab, middle click on a tab, dragging the sidebar edge in the native window (WebKit in the app, not only headless) | M65 |
| Diagnostic text after the line (`<Space>ud`) while typing in a Go file with errors: no stutter; hex color swatches in `themes.ts` | M65 |
| lazygit commit from the terminal split; btop and tables render | M5, M6 |
| Hot exit: kill the app while typing, start again, restore offered per file | M49 |
| Tasks: `<Space>rr` runs one from `settings.json`, errors fill the quickfix list | M52 |
| A file with one 30,000-character line (`python3 -c "print('x'*30000)" > long.json`): the status bar shows `plain text` with a tooltip; a normal `.go` file does not | M83 |
| In the tree, `c` on a file, change the name, Enter: the copy appears and is selected; the same name again says "already exists"; a folder says only files work | M83 |
| Tasks with `${file}`, `${dir}`, `${line}` in `settings.json`: `<Space>rr` on an open Go file prints path and line; with no editor open, `<Space>rl` says the task needs an open file | M82 |
| `<Space>fT` lists TODO, FIXME and HACK comments without typing, Enter jumps there, `<C-q>` fills the quickfix list | M82 |
| `<Space>fh` on a file saved twice: Cmd+Enter on the older version restores it as unsaved changes (tab shows `[+]`, disk keeps the new text), `u` undoes it | M82 |
| `<Space>fw`, type "func", Esc, then `<Space>f.`: the same picker opens with "func" and its results | M82 |
| In the terminal, `echo "main.go:3:1: x"`: the path is underlined on hover and a click opens `main.go` at line 3 in the editor pane next to it; an `https://` URL still opens the browser | M82 |
| `<Space>go` in a file of a repo with a GitHub remote opens the browser on the current branch at the cursor line; `<Space>gy` copies a permalink with the commit SHA and `#L<line>` | M82 |

## Hyprland (Arch, Intel UHD)

| Check | From |
|---|---|
| App starts, scroll test with 10,000 rows holds frame rate (S1) | M0 |
| Terminal renderer: DOM versus WebGL on this GPU (S6) | M5 |
| PDF scrolling at 120 Hz, memory with `big.pdf` (K8) | M10 |
| Everything in the macOS list that doesn't depend on macOS (clipboard, trash through `gio`, packaging through the PKGBUILD) | all |

## Before a release

- [ ] `task test` and `bun run --cwd frontend test:browser` are green, and `bun run --cwd frontend e2e` against `task build:server` (the last two don't run in CI).
- [ ] CI is green on the release pull request.
- [ ] The two lists above are ticked off.
