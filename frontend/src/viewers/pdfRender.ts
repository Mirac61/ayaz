// Client of the render worker: PDFViewer's page.render() calls go here instead of drawing on the main thread.
// Loaded together with pdf.js, so RenderingCancelledException is the class the viewer checks against.
import { RenderingCancelledException } from "pdfjs-dist";

export interface RenderJob { page: number; scale: number; rotation: number; offsetX: number; offsetY: number; transform: number[] | null; annotationMode: number; width: number; height: number }
export interface Renderer {
  open(url: string): Promise<void>; // newest open wins; jobs of an older open reject with RenderingCancelledException
  render(job: RenderJob): { promise: Promise<ImageBitmap>; cancel(): void };
  dispose(): void; // terminates the worker
}

const cancelled = (why: string) => new RenderingCancelledException(why) as unknown as Error;

type Reply = { opened: string; error?: string } | { id: number; bitmap?: ImageBitmap; error?: string };

export function createRenderer(): Renderer {
  const worker = new Worker(new URL("./pdfRender.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, { ok: (b: ImageBitmap) => void; fail: (e: Error) => void }>();
  let next = 0, url = "", opened: { ok: () => void; fail: (e: Error) => void } | null = null;
  const drop = (id: number, e: Error) => { pending.get(id)?.fail(e); pending.delete(id); };

  worker.onmessage = (e: MessageEvent<Reply>) => {
    const m = e.data;
    if ("opened" in m) {
      if (m.opened !== url) return;
      if (m.error) opened?.fail(new Error(m.error)); else opened?.ok();
      opened = null;
      return;
    }
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (!p) m.bitmap?.close(); // cancelled or from an older document: never drawn
    else if (m.bitmap) p.ok(m.bitmap);
    else p.fail(new Error(m.error));
  };

  return {
    open(u) {
      for (const id of [...pending.keys()]) drop(id, cancelled("new document"));
      opened?.fail(cancelled("new document"));
      url = u;
      worker.postMessage({ open: u });
      return new Promise((ok, fail) => (opened = { ok, fail }));
    },
    render(job) {
      const id = next++;
      const promise = new Promise<ImageBitmap>((ok, fail) => pending.set(id, { ok, fail }));
      worker.postMessage({ id, job });
      return {
        promise,
        cancel: () => {
          if (!pending.has(id)) return;
          drop(id, cancelled("cancelled"));
          worker.postMessage({ id, cancel: true });
        },
      };
    },
    dispose() {
      for (const id of [...pending.keys()]) drop(id, cancelled("disposed"));
      worker.terminate();
    },
  };
}
