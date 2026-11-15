// S8 spike: pdf.js renders a page on an OffscreenCanvas inside a module worker and posts back an ImageBitmap.
import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// pdf.js builds its own worker from window.location, which a worker lacks; hand it the port instead.
pdfjs.GlobalWorkerOptions.workerPort = new Worker(workerSrc, { type: "module" });

class OffscreenCanvasFactory {
  create(w: number, h: number) { const canvas = new OffscreenCanvas(w, h); return { canvas, context: canvas.getContext("2d") }; }
  reset(c: { canvas: OffscreenCanvas }, w: number, h: number) { c.canvas.width = w; c.canvas.height = h; }
  destroy(c: { canvas: OffscreenCanvas | null; context: unknown }) { if (c.canvas) c.canvas.width = c.canvas.height = 0; c.canvas = null; c.context = null; }
}

let doc: pdfjs.PDFDocumentProxy | null = null;
self.onmessage = async (e: MessageEvent<{ url?: string; page: number; width: number; height: number; options: Record<string, unknown> }>) => {
  const { url, page, width, height, options } = e.data;
  try {
    const fonts = (self as unknown as { fonts?: FontFaceSet }).fonts;
    if (url) doc = await pdfjs.getDocument({ url: new URL(url, location.href), enableXfa: false, CanvasFactory: OffscreenCanvasFactory, ownerDocument: { fonts }, ...options } as never).promise;
    const t0 = performance.now();
    const p = await doc!.getPage(page);
    const vp = p.getViewport({ scale: width / p.getViewport({ scale: 1 }).width });
    const canvas = new OffscreenCanvas(width, height);
    await p.render({ canvasContext: canvas.getContext("2d") as never, canvas: canvas as never, viewport: vp }).promise;
    const bitmap = canvas.transferToImageBitmap();
    postMessage({ bitmap, ms: performance.now() - t0, fonts: !!fonts }, { transfer: [bitmap] });
  } catch (err) {
    postMessage({ error: String((err as Error)?.stack ?? err) });
  }
};
