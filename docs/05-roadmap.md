# 05 – Roadmap

Updated 2026-11-17 · Each milestone was a vertical slice: afterwards the app starts and can do a bit more than before. The details of each one (what was built, which tests) are in the commit and PR history; this page is the overview.

- **[Own]** = I write it myself: worth learning, well-scoped, testable.
- **[Glue]** = wire up a library, little logic of our own.
- Every milestone also has to meet [When is a milestone "tested"?](04-testing.md#when-is-a-milestone-tested).

**Order:** first an editor with terminal and Markdown live preview I can use every day (M1–M6), then LSP and project search (M7–M9), then images and PDF (M10–M12), then windows and packaging (M13–M14). Markdown comes before LSP on purpose (Q27). The terminal comes early (M4) because it's a core requirement and sets up the stream pattern for LSP. File watching comes before it (M3), otherwise things done in the terminal (`git checkout`, codegen) never reach the editor.

![Milestones in order](diagrams/roadmap.svg)

## Done

All milestones below are finished. M0–M5 have no date recorded.

| | What | Done |
|---|---|---|
| M0 | Skeleton, measuring, spikes | done |
| M1 | Open a folder, tree, edit and save a file | done |
| M2 | Commands, keymap, fuzzy finder, splits | done |
| M3 | File watching | done |
| M4 | Terminal | done |
| M5 | Markdown live preview, inline | done |
| M6 | Markdown live preview, blocks | 2026-11-09 |
| M7 | LSP for Go | 2026-11-09 |
| M8 | Project search and quickfix | 2026-11-09 |
| M9 | LSP for C/C++, web, Java | 2026-11-09 |
| M10 | Image viewer | 2026-11-09 |
| M11 | PDF viewer | 2026-11-09 |
| M12 | Separate Markdown preview and optional tabs | 2026-11-09 |
| M13 | Multiple windows and switching folders | 2026-11-09 |
| M14 | Packaging and hardening | 2026-11-09 |
| M15 | File operations in the tree | 2026-11-10 |
| M16 | Session per folder | 2026-11-10 |
| M17 | Zoom | 2026-11-10 |
| M18 | Reopen closed tabs, back and forward across files | 2026-11-10 |
| M19 | Git in the gutter, branch in the status line (L2, first part) | 2026-11-10 |
| M20 | Symbols | 2026-11-10 |
| M21 | Diagnostics as a list and in the status line | 2026-11-10 |
| M22 | Cleanup on save, line wrap | 2026-11-10 |
| M23 | Cmd+Q asks first | 2026-11-10 |
| M24 | Comments, closing brackets, surround | 2026-11-10 |
| M25 | LSP keys | 2026-11-10 |
| M26 | settings.json | 2026-11-10 |
| M27 | Bundled symbols font | 2026-11-10 |
| M28 | Welcome page with keys | 2026-11-10 |
| M29 | Git status in the tree (L2, second part) | 2026-11-10 |
| M30 | Diff against HEAD (L2, last part) | 2026-11-10 |
| M31 | Filter the tree | 2026-11-10 |
| M49 | Hot exit | 2026-11-10 |
| M50 | Local history | 2026-11-10 |
| M51 | Big files and repositories measured | 2026-11-10 |
| M52 | Tasks | 2026-11-10 |
| M53 | Shell integration | 2026-11-10 |
| M54 | Semantic tokens | 2026-11-10 |
| M55 | Structural text objects | 2026-11-10 |
| M56 | Document highlight | 2026-11-10 |
| M57 | Sticky scroll | 2026-11-10 |
| M58 | Call hierarchy | 2026-11-10 |
| M59 | Completion: extra edits, snippets | 2026-11-10 |
| M60 | Inline blame | 2026-11-10 |
| M61 | Stage hunks | 2026-11-10 |
| M62 | Merge conflicts | 2026-11-10 |
| M63 | Vim fidelity | 2026-11-10 |
| M64 | Release readiness | 2026-11-10 |
| M65 | UX pass | 2026-11-11 |
| M66 | More languages, Typst and LaTeX | 2026-11-11 |
| M67 | Small daily things | 2026-11-11 |
| M68 | Debugger: program stderr | 2026-11-11 |
| M69 | Debugger: adapter table and stdio mode | 2026-11-12 |
| M70 | Debugger: conditional breakpoints, logpoints and hit counts | 2026-11-12 |
| M71 | Debugger: watch expressions | 2026-11-12 |
| M72 | Debugger: program stdin and runInTerminal | 2026-11-12 |
| M73 | Debugger: Python with debugpy | 2026-11-12 |
| M74 | Debugger: Rust, C, C++ with lldb-dap | 2026-11-12 |
| M75 | Git staging tab, platform-specific install hints and Windows hardening | 2026-11-12 |
| M76 | Platform-independent in-app auto-update and local release workflow | 2026-11-12 |
| M77 | Docs Hub | 2026-11-13 |
| M78 | Git remotes and cloning | 2026-11-13 |
| M79 | Themes and start page | 2026-11-13 |
| M80 | Standard mode and HTML preview | 2026-11-14 |
| M81 | Release automation | 2026-11-14 |
| M82 | Small daily things, part 2 | 2026-11-16 |

## Open

- **Status line:** encoding and powerline shapes like lualine bubbles (E4). Git branch and diagnostics came with M19 and M21.
- **Cmdline and messages:** the `:` line is a floating box now (`Cmdline.tsx`); messages as a floating box and notifications that fade out are not checked (E5).
- **Scrolling and motion:** smooth scrolling and an animated indent scope; check that 120 fps holds (E6).
- **Window:** the macOS title bar is hidden with native traffic lights; the window title with folder and file is not checked (E8).
- **Theme:** follow the desktop theme (caelestia) (E9).
- **Details:** scrollbar style, cursor line edge, spacing between tree and editor, hover states (E10).
- **Agent:** inline agent at the cursor like Zed: real model backend, diff preview, apply/reject per hunk. Removed in 2026-11 because it only showed canned answers (E11).

---

## What I write myself, and why

| Module | Why it's worth writing |
|---|---|
| `workspace` (jail, atomic write, registry) | security, data loss, learn fuzzing |
| Fuzzy matcher + index | algorithm, benchmarks |
| Command registry + keymap | the core of the controls, small and pure |
| Splits/buffer model + bottom panel | tree data structure, easy to test |
| PTY output batching | concurrency, latency vs. throughput |
| LSP framing + process management | protocol, processes, concurrency |
| Project search + quickfix | worker pool, streaming, cancellation |
| `mdlive` | CM6 decorations, pure functions |
| Lezer → DOM (separate preview) | tree traversal, escaping |
| Virtualized file tree | DOM performance |
| Custom Vim motions | well-scoped via `defineMotion` |

Everything else (Wails setup, CM6/Vim/language config, xterm.js, LSP clients, pdf.js, image viewer, fswatcher adapter, `fsserve` wrapper, packaging) is glue.

