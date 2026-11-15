# ADR-0012: React only for the shell

Status: **accepted** · 2026-11-08 (measured in M0)

## Context
- The planned stack is React + TypeScript.
- The expensive parts of the UI (editor, PDF, terminal) are imperative. React only renders tree, panes, picker, palette and status line.

## Options
1. **React**: familiar, big ecosystem (virtualization, testing). ~40–50 KB gzip runtime.
2. SolidJS/Svelte: smaller, fine-grained updates, but a new framework to learn.
3. Vanilla TS: lightest, but tree/picker/palette by hand.

## Decision
React, with principle 5 from [02](../02-architecture.md#principles): no editor/PDF state in React state.

## Consequences
- \+ Familiar tool, focus stays on the interesting modules.
- − The runtime costs cold-start time. Measured in M0; if K1 misses and React is measurably the cause, decide again.
