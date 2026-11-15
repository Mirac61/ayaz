# ADR-0002: CodeMirror 6 + @replit/codemirror-vim

Status: proposed · 2026-11-08

## Context
- The editor must be fast on big files, support decorations for live preview, and do Vim.
- Basic Vim is enough at first; custom motions should be possible later.

## Options
Editor:
1. **CodeMirror 6**: renders only the viewport, incremental Lezer parser, decorations and widgets are core concepts.
2. Monaco: heavier, built around the VS Code model, Vim only via third parties, live-preview decorations much more awkward.
3. ProseMirror / WYSIWYG: no Markdown source, Vim practically impossible.

Vim:
1. **`@replit/codemirror-vim`**: maintained, API `Vim.map/defineEx/defineOperator/defineMotion/mapCommand`.
2. Own implementation: way too much work.

## Decision
CM6 + `@replit/codemirror-vim`, wrapped in `frontend/src/editor/vim/`. Ex commands and leader mappings call the command registry.

## Consequences
- \+ Viewport rendering covers K3–K5.
- \+ Custom motions via `defineMotion` + `mapCommand`. Define them as motions, not actions, so they work with operators.
- − The Vim engine is a CM5 port behind an adapter; some details differ from real Vim. Full Vim is a non-goal anyway.
- − `defineMotion`/`defineAction` are only documented in the CM5 manual → cover them with a test in M1.
