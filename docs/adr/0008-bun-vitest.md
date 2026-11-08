# ADR-0008: Bun as package manager, Vitest as test runner

Status: proposed · 2026-11-08

## Context
- Bun instead of npm is a given.
- Wails Taskfiles choose the package manager via a `PACKAGE_MANAGER` variable (exact syntax unverified). Otherwise replace `npm install`/`npm run build` in `build/Taskfile.yml`.
- CM6 view tests need real layout; jsdom has none.

## Options
1. `bun test`: fast, but no browser mode.
2. **Vitest** (via `bun run`): Node mode for pure logic, browser mode (Playwright) for EditorView/Vim. Browser mode is stable since Vitest 4.
3. Jest + jsdom: no layout, slower.

## Decision
Bun for installs, scripts and the lockfile. Vite as bundler. Vitest as the only frontend test runner.

## Consequences
- \+ One runner for logic and DOM tests; browser mode can use WebKit (closer to our WebViews than Chromium).
- − Vitest runs on Node, not the Bun runtime, so Bun is only package manager and script runner. Bun + Vitest browser mode is checked in Spike S5.
- − The Taskfile changes for Bun need checking on every Wails upgrade.
