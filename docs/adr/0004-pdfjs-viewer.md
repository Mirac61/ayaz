# ADR-0004: pdf.js with the PDFViewer component

Status: accepted · 2026-11-09 (pdfjs-dist 6.4.299; S3 in headless WebKit only)

## Context
- Scroll, zoom and search PDFs. 200 pages must be smooth.
- WKWebView/WebKitGTK have no built-in PDF viewer we could control and theme.

## Options
1. Mozilla's `viewer.html` in an iframe: complete, but foreign UI and keys, and the iframe can reach the bindings.
2. **`PDFViewer` from `pdfjs-dist/web/pdf_viewer`**: lazy rendering, text layer, `PDFFindController`, zoom. UI and keys are ours.
3. Own renderer on `getDocument`/`page.render`: build lazy loading, text layer and search ourselves.

## Decision
Option 2. pdf.js is loaded with dynamic `import()` on the first PDF. No scripting manager. The PDF comes by URL from `/fs/`.

## Consequences
- \+ Search and lazy rendering without building them.
- \+ Cold start unaffected while no PDF is open.
- − Core and viewer versions must match exactly, so one pinned version.
- − The web component API changes more often between majors than the core API. Upgrades are covered by an E2E test.
- Page canvases render in a worker (pdf.js inside a module worker, `OffscreenCanvas` → `ImageBitmap`), so scrolling keeps 120 fps (S8, M11).
- Open: Range requests through the Wails scheme (Spike S2, start of M6). Fallback: load the whole file.
