# ADR-0011: Pane content as providers mounted into the DOM

Status: accepted · 2026-11-09 (images in M10; editor and terminal still outside the registry)

## Context
- Markdown, PDF, image and terminal should be swappable modules behind one interface.
- CM6, xterm.js and pdf.js are imperative and manage their own DOM.

## Options
1. One React component per viewer: re-render risk for editor/PDF, lifecycle scattered across effects.
2. **Provider interface** `canOpen / mount(el) → ViewHandle` ([02](../02-architecture.md#provider-interface)).
3. Web components: an extra standard with no benefit here.

## Decision
Option 2. The React shell gives each pane an empty `div` and calls `mount`. The provider is picked by `canOpen` priority.

## Consequences
- \+ Providers don't depend on React and can be tested alone (mount, run commands, check the DOM).
- \+ New file type = new file + registration.
- − React can't see inside providers. The status line and similar things use small callbacks/events in `ViewContext`.
