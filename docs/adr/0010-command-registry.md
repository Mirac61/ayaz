# ADR-0010: Command registry at the center

Status: **accepted** · 2026-11-08 (built in M2)

## Context
- Keyboard-first: every action must be reachable by key.
- Four entry points: Vim (ex commands, leader), global shortcuts, command palette, later menus.

## Options
1. Each module registers its own keydown handlers: quick to build, but conflicts and duplicated logic.
2. **Central registry** `id → handler`; keymaps map keys to IDs.

## Decision
Option 2. A command has `id`, `title` and `run(arg)`. No `when` yet: keymap contexts (`normal`, `global`) were enough in M2. Keymaps are data (context + key → ID), configurable via `config`.

## Consequences
- \+ The palette lists everything automatically; E2E tests can run commands directly.
- \+ Vim ex commands are thin aliases (`:w` → `file.save`).
- − A bit more indirection than direct handlers. Internal only, no plugin API.
- Well-scoped module to write myself.
