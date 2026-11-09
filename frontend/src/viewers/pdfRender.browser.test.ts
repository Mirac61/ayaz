import { afterEach, expect, test } from "vitest";
import { RenderingCancelledException } from "pdfjs-dist";
import { createRenderer, renderTask, type RenderJob, type Renderer } from "./pdfRender";
import { textPdf } from "../spikes/pdfS8";

const job = (j: Partial<RenderJob>): RenderJob =>
  ({ page: 1, scale: 1, rotation: 0, offsetX: 0, offsetY: 0, transform: null, annotationMode: 1, width: 612, height: 792, ...j });

const pixels = (b: ImageBitmap, x = 0, y = 0, w = b.width, h = b.height) => {
  const ctx = Object.assign(document.createElement("canvas"), { width: b.width, height: b.height }).getContext("2d", { alpha: false })!;
  ctx.drawImage(b, 0, 0);
  return ctx.getImageData(x, y, w, h).data;
};
const dark = (px: Uint8ClampedArray) => { let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] < 100) n++; return n; };

let r: Renderer;
afterEach(() => r?.dispose());

test("renders a page at the asked size", async () => {
  r = createRenderer();
  await r.open(textPdf(2));
  const b = await r.render(job({})).promise;
  expect([b.width, b.height]).toEqual([612, 792]);
  expect(dark(pixels(b))).toBeGreaterThan(1000);
});

test("detail area: transform and offset", async () => {
  r = createRenderer();
  await r.open(textPdf(1));
  const full = await r.render(job({ scale: 2, width: 1224, height: 1584 })).promise;
  const part = await r.render(job({ transform: [2, 0, 0, 2, -100, -200], width: 300, height: 400 })).promise;
  expect([part.width, part.height]).toEqual([300, 400]);
  const a = pixels(full, 100, 200, 300, 400), b = pixels(part);
  expect(dark(b)).toBeGreaterThan(500);
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]);
  expect(diff / (a.length / 4)).toBeLessThan(2); // mean difference per pixel, out of 255
});

test("cancel rejects with RenderingCancelledException", async () => {
  r = createRenderer();
  await r.open(textPdf(1));
  const t = r.render(job({ scale: 4, width: 2448, height: 3168 }));
  t.cancel();
  await expect(t.promise).rejects.toBeInstanceOf(RenderingCancelledException);
  expect((await r.render(job({})).promise).width).toBe(612); // the worker goes on
});

test("open() of a new URL rejects jobs of the old one", async () => {
  r = createRenderer();
  await r.open(textPdf(1));
  const old = r.render(job({}));
  const opened = r.open(textPdf(3));
  await expect(old.promise).rejects.toBeInstanceOf(RenderingCancelledException);
  await opened;
  expect(dark(pixels(await r.render(job({ page: 3 })).promise))).toBeGreaterThan(1000);
});

const params = (canvas: HTMLCanvasElement) =>
  ({ canvas, viewport: { scale: 1, rotation: 0, offsetX: 0, offsetY: 0 }, transform: null, annotationMode: 1 }) as unknown as
    Parameters<typeof renderTask>[2];

test("renderTask draws the bitmap into the viewer's canvas", async () => {
  r = createRenderer();
  await r.open(textPdf(1));
  const canvas = Object.assign(document.createElement("canvas"), { width: 612, height: 792 });
  await renderTask(r, 1, params(canvas)).promise;
  expect(dark(canvas.getContext("2d")!.getImageData(0, 0, 612, 792).data)).toBeGreaterThan(1000);
});

// PDFViewer drops the half-done canvas in onError; without it every cancelled detail render left a full-size canvas behind.
test("renderTask: cancel calls onError like pdf.js' RenderTask", async () => {
  r = createRenderer();
  await r.open(textPdf(1));
  const t = renderTask(r, 1, params(Object.assign(document.createElement("canvas"), { width: 612, height: 792 })));
  let got: unknown;
  t.onError = (e: unknown) => (got = e);
  t.cancel();
  await expect(t.promise).rejects.toBeInstanceOf(RenderingCancelledException);
  expect(got).toBeInstanceOf(RenderingCancelledException);
});
