# ADR-0005: Files via asset middleware `/fs/` with a workspace jail

Status: proposed · 2026-11-08

## Context
- Images, PDFs and images in Markdown must get from the open folder into the WebView.
- Wails v3 has `AssetOptions{Handler, Middleware}`, served through a custom scheme without an open port.

## Options
1. `file://` URLs: unsafe, cross-origin problems.
2. Base64 via bindings: ×1.33 memory, no streaming, no browser cache.
3. **Middleware route `/fs/<workspace-id>/<relative path>`** with `http.ServeContent`.
4. Local HTTP server on a port: open port, needs a token, no advantage over 3.

## Decision
Option 3. The handler resolves every path via `workspace.Resolve` and rejects anything outside the root, also after resolving symlinks. Editor text still goes through bindings.

## Consequences
- \+ Range, ETag, MIME and conditional requests come from the stdlib.
- \+ `<img src="/fs/...">` and pdf.js work without special cases.
- − Path validation is security-critical → fuzz test required.
- − Whether Range headers make it through the scheme on WebKitGTK is open (Spike S2, start of M6).
- Multiple windows (ADR-0014): the workspace ID in the path picks the root; unknown IDs → 404.
