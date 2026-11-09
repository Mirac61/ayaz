// Render worker (S8): its own pdf.js draws page canvases on an OffscreenCanvas and sends back ImageBitmaps,
// so the main thread only copies pixels while the PDF scrolls.
import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { RenderJob } from "./pdfRender";

// pdf.js builds its worker from window.location, which a worker lacks, and would fall back to an in-thread one; hand it the port.
pdfjs.GlobalWorkerOptions.workerPort = new Worker(workerSrc, { type: "module" });

class OffscreenCanvasFactory {
  create(w: number, h: number) { const canvas = new OffscreenCanvas(w, h); return { canvas, context: canvas.getContext("2d") }; }
  reset(c: { canvas: OffscreenCanvas }, w: number, h: number) { c.canvas.width = w; c.canvas.height = h; }
  destroy(c: { canvas: OffscreenCanvas | null; context: unknown }) { if (c.canvas) c.canvas.width = c.canvas.height = 0; c.canvas = null; c.context = null; }
}

type Msg = { open: string } | { id: number; job: RenderJob } | { id: number; cancel: true };

let task: pdfjs.PDFDocumentLoadingTask | null = null, gen = 0;
let doc: Promise<pdfjs.PDFDocumentProxy> = Promise.reject(new Error("no document"));
let opening = Promise.resolve(); // pdf.js refuses a new document on the shared port until the old one is destroyed
doc.catch(() => {});
const running = new Map<number, pdfjs.RenderTask>();
const cancelled = new Set<number>(); // cancelled before their render started

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  if ("open" in m) {
    const g = ++gen;
    const created = opening.then(async () => {
      await task?.destroy(); // rejects the old document's renders
      task = null;
      if (g !== gen) throw new pdfjs.RenderingCancelledException("newer document");
      return (task = pdfjs.getDocument({
        url: new URL(m.open, location.href), enableXfa: false, CanvasFactory: OffscreenCanvasFactory,
        ownerDocument: { fonts: (self as unknown as { fonts: FontFaceSet }).fonts },
      } as Parameters<typeof pdfjs.getDocument>[0] & object));
    });
    opening = created.then(() => {}, () => {});
    doc = created.then((t) => t.promise);
    doc.then(() => g === gen && postMessage({ opened: m.open }), (err) => g === gen && postMessage({ opened: m.open, error: String(err) }));
    return;
  }
  if ("cancel" in m) {
    if (running.has(m.id)) running.get(m.id)!.cancel();
    else cancelled.add(m.id);
    return;
  }
  const { id, job } = m;
  try {
    const page = await (await doc).getPage(job.page);
    if (cancelled.delete(id)) throw new pdfjs.RenderingCancelledException("cancelled");
    const canvas = new OffscreenCanvas(job.width, job.height);
    const viewport = page.getViewport({ scale: job.scale, rotation: job.rotation, offsetX: job.offsetX, offsetY: job.offsetY });
    const r = page.render({ canvasContext: canvas.getContext("2d") as never, canvas: canvas as never, viewport, transform: job.transform ?? undefined, annotationMode: job.annotationMode });
    running.set(id, r);
    await r.promise.finally(() => running.delete(id));
    const bitmap = canvas.transferToImageBitmap();
    postMessage({ id, bitmap }, { transfer: [bitmap] });
  } catch (err) {
    cancelled.delete(id);
    postMessage({ id, error: String(err) });
  }
};
