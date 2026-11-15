# ADR-0003: Live preview as our own CM6 extension on the Lezer tree

Status: proposed · 2026-11-08

## Context
- Markdown should look rendered inside the editor (Obsidian style): markers disappear outside the cursor line, tables and images show inline.
- Optionally a separate preview pane.
- `@codemirror/lang-markdown` already parses with `@lezer/markdown` (incl. GFM).

## Options
1. **Own extension on the Lezer tree**; the separate preview renders the same tree to DOM.
2. Adopt a live-preview library (e.g. codemirror-rich-markdoc): small, barely maintained, doesn't fit exactly.
3. A second parser (markdown-it/remark) for the separate preview: two sources of truth, editor and preview drift apart.

## Decision
Option 1. Inline decorations as a `ViewPlugin` over `visibleRanges`, block widgets (tables, images) as a `StateField`. Decorations are computed by a pure function.

## Consequences
- \+ One parser, incremental, visible range only → scales to 5,000+ lines.
- \+ Well-scoped module to write myself; pure functions are easy to test.
- − We write the HTML rendering for the separate preview ourselves (lists, tables, escaping).
- − CommonMark edge cases depend on `@lezer/markdown`, not on us.
- Block widgets change line heights, so scroll jumps are a known risk. Widgets need `estimatedHeight`; images reserve space once their size is known.
