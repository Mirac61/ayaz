# ADR-0015: Languages via Lezer packages + LSP servers from PATH

Status: proposed · 2026-11-08

## Context
- Full support for Go, C/C++, web (TS/JS, HTML, CSS, JSON), Java, in that order.
- "Full" means highlighting, indentation, folding (local) plus diagnostics, completion, go to definition, hover, rename, format (LSP).

## Options
Highlighting:
1. **Official Lezer packages** (`@codemirror/lang-*`), the rest via `@codemirror/legacy-modes`.
2. Tree-sitter as WASM: a second parser world, heavier, no gain for these languages.

LSP servers:
1. **Installed by the user, found via `PATH`**, path overridable in config.
2. Download automatically (like VS Code extensions / Mason): convenient, but version, update and trust questions.

## Decision
Lezer packages, loaded lazily per language. LSP servers from `PATH`. If one is missing, the status line shows a hint with the install command. A table in `lang/registry.ts` maps extension → language package → server ID.

## Consequences
- \+ New language = one table row + a config entry.
- \+ No download logic, no supply-chain questions in the editor.
- − First setup is manual (`go install gopls`, `brew install llvm` / `pacman -S clang`, `npm i -g ...`, jdtls).
- − jdtls needs a JVM and a lot of RAM, which is one more reason Java comes last.
- − clangd needs `compile_commands.json` or includes are wrong. That's project setup, not the editor's job; mention it in the docs.
