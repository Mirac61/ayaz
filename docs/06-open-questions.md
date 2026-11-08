# 06 – Open questions

Updated 2026-11-08 · Each question has a recommendation and a reason.

## Decided

| # | Question | Decision |
|---|---|---|
| Q1 | GPU of the Hyprland PC | Intel UHD → GPU path stays on, no workarounds |
| Q2 | Wails v3? | yes, pinned version (ADR-0001) |
| Q3 | React? | yes, measured in M0 (ADR-0012) |
| Q4 | Opening folders | like VS Code: switch folder in a window **and** new windows, one folder per window (ADR-0014) |
| Q5 | Organizing files | splits + buffer list, tab bar optional |
| Q6 | Saving | explicit (`:w`, `Cmd/Ctrl+S`) |
| Q20 | Daily Vim features | the basics, list in [04 – Vim core list](04-testing.md#vim-core-list-q20) |
| Q21 | Leader mappings | taken from my nvim config as defaults (see [02 – Default keymap](02-architecture.md#default-keymap-from-my-nvim-config)) |
| Q22 | Shortcuts | every key configurable. Defaults: `<Space>` leader in Vim normal mode (insert mode types a normal space), plus `Cmd+…` on macOS / `Ctrl+Shift+…` on Linux where Vim doesn't apply (terminal, insert mode) |
| Q23 | Terminal | both, like VS Code/Zed: bottom panel toggled with `Cmd+J` / `Ctrl+Shift+J`, or a normal pane in the splits |
| Q24 | Leave terminal insert mode | `Ctrl-\ Ctrl-n` like nvim, plus a configurable alternative |
| Q25 | Format on save | per language; on for Go, off for the rest by default |
| Q26 | Files in finder and search | by default what Git doesn't ignore (outside Git: fixed list like `node_modules`, `dist`, `build`). Configurable, and a setting/toggle to show ignored files too |
| Q27 | Roadmap order | Markdown live preview before LSP (M5–M6), then LSP and search (M7–M9) |
| – | Direction | code editor with nvim feel, plus proper Markdown/PDF/images; a real terminal is required |
| – | Languages | Go → C/C++ → web (TS/JS, HTML, CSS, JSON) → Java |
| – | Later | tasks/build, Git, debugger (DAP) |

## Open: Markdown (M5–M6, M12)

**Q7 – Which Markdown flavor?**
- Recommendation: CommonMark + GFM (tables, strikethrough, task lists, autolinks) + YAML front matter (highlighted only). No wiki links, no math in v1.
- Why: that's what GitHub renders, so it fits repos. Math needs KaTeX/MathJax (heavy).

**Q8 – Raw HTML in Markdown?**
- Recommendation: don't render it in v1, show it as source. Later optionally with a sanitizer.
- Why: any code in the WebView can call the bindings, including starting a terminal. An `<img onerror=...>` in a foreign README could otherwise start a shell.

**Q9 – Images outside the workspace?**
- Recommendation: block them, show a placeholder with a note.
- Why: the jail is the security boundary.

**Q10 – Symlinks pointing out of the workspace?**
- Recommendation: show them in the tree, block opening and serving.
- Why: same as Q9.

**Q11 – Separate preview with its own renderer?**
- Recommendation: yes, Lezer tree → DOM (ADR-0003).
- Why: one parser, no differences, no extra package.

## Open: later

**Q13 – Config format?** JSON in `os.UserConfigDir()/ayaz/config.json`. Why: stdlib, no dependency.

**Q14 – Linux package?** Binary + `.desktop`, then a PKGBUILD. No AppImage. Why: WebKitGTK is a system dependency anyway, so AppImage gains nothing.

**Q15 – Sign the macOS app?** No, it's for my own use. Why: the developer account costs money and changes nothing locally.

**Q16 – Kanagawa?** *wave* as default, *dragon* as second variant. Check the kanagawa.nvim license before copying.

**Q17 – Minimum versions?** macOS as on my Mac, Linux GTK ≥ 4.10 + WebKitGTK 6.0. Why: Wails v3 needs GTK ≥ 4.10.

**Q18 – Large files?** Above 10 MB no live preview and no LSP, above 100 MB only after confirming. Numbers measured in M9.

**Q19 – Name?** "Ayaz" is the working title, decide before M14. Why: it ends up in the config path, bundle ID and package names.

**Q28 – Install LSP servers automatically?** No, use `PATH` (ADR-0015). Why: no download and trust logic in the editor; a hint with the install command is enough for four languages.
