# 07 – Manual checks

Updated 2026-11-10

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
| lazygit commit from the terminal split; btop and tables render | M5, M6 |
| Hot exit: kill the app while typing, start again, restore offered per file | M49 |
| Tasks: `<Space>rr` runs one from `settings.json`, errors fill the quickfix list | M52 |

## Hyprland (Arch, Intel UHD)

| Check | From |
|---|---|
| App starts, scroll test with 10,000 rows holds frame rate (S1) | M0 |
| Terminal renderer: DOM versus WebGL on this GPU (S6) | M5 |
| PDF scrolling at 120 Hz, memory with `big.pdf` (K8) | M10 |
| Everything in the macOS list that doesn't depend on macOS (clipboard, trash through `gio`, packaging through the PKGBUILD) | all |

## Before a release

- [ ] `LICENSE`: the author picks it (none is in the repository yet).
- [ ] CI is green on a pull request (Go on macOS and Linux, Vitest, browser tests and E2E on both).
- [ ] The two lists above are ticked off.
- [ ] Push only after the author says so: the local branch is far ahead of `origin`.
