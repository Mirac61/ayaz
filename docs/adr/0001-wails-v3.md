# ADR-0001: Wails v3 instead of v2 or Tauri

Status: **accepted** · 2026-11-08

## Context
- Desktop app with the system WebView, Go backend, macOS + Linux (Wayland).
- Wails v3.0.0 is stable since 2026-10-26, now at 3.1.0. v2 (2.17.1) only gets critical fixes.
- Tauri 2.12 is more mature but also uses WebKitGTK (GTK3) on Linux. Chromium (CEF) only exists in Tauri 3 alpha, and its Linux packaging is currently broken.

## Options
1. Wails v2: stable but being phased out. No server build for E2E, GTK3.
2. **Wails v3**: current line, GTK4/WebKitGTK 6.0, services, server build for Playwright.
3. Tauri 2: more mature, better permission model, but Rust and no rendering advantage on Linux.
4. Tauri 3 + CEF: Chromium on Linux, but alpha and packages of several hundred MB. Not "lightweight".

## Decision
Wails v3, pinned to an exact version (CLI, Go module and `@wailsio/runtime` identical).

## Consequences
- \+ Go backend, server build for E2E, no v2 → v3 migration later.
- − Young stable version: expect bugs. Weekly minor releases, so upgrade only on purpose and after reading the changelog.
- − Bindings in the WebView are unprotected → the rules in [02 Security](../02-architecture.md#security) are mandatory.
- Way out: logic in `internal/*` doesn't know Wails and the frontend only uses `backend.ts`, so a framework switch touches `app/`, `main.go` and `backend.ts`.
