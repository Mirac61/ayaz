# ADR-0009: LSP via @codemirror/lsp-client and Wails streams

Status: proposed · 2026-11-08

## Context
- Ayaz is a code editor, so LSP is core, not an add-on.
- `@codemirror/lsp-client` expects a `Transport` with `send/subscribe/unsubscribe` and JSON strings without framing.
- Language servers are processes speaking stdio with `Content-Length` framing.
- Wails v3 streams are ordered, bidirectional and need no port.

## Options
Client:
1. **`@codemirror/lsp-client`**: official, by the CM author.
2. `codemirror-languageserver` (marimo): different API, own WebSocket transport.

Bridge:
1. **Wails streams**, one stream per server instance.
2. Wails events: not meant for streams this size.
3. WebSocket on localhost: port + token, more attack surface.

## Decision
`@codemirror/lsp-client` + a transport adapter on Wails streams. In Go, `internal/lsp` manages processes per (workspace, language): start on demand, restart with backoff, shut down when the workspace closes, framing.

## Consequences
- \+ Same pattern as the terminal (ADR-0013) and later DAP.
- \+ Framing and process management are testable modules to learn from.
- − Stream latency (K16) is only known after Spike S6/S7 (one spike in M0). Fallback: WebSocket with a token.
- − `@codemirror/lsp-client` pulls in `marked` and `vscode-languageserver-protocol`. Load them only in the LSP chunk.
- − Unclear whether the client covers everything (cross-file rename, code actions, semantic tokens). Missing pieces become our own extensions on `client.request()`.
