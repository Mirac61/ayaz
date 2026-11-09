// S8 spike: does pdf.js render in a module worker under WebKit? Numbers go to docs/01-research.md.
import { expect, test } from "vitest";
import { stats } from "./stats";
import { ask, textPdf, W, H } from "./pdfS8";

test("S8: pdf.js renders a page in a worker", { timeout: 60_000 }, async () => {
  const worker = new Worker(new URL("./pdfS8.worker.ts", import.meta.url), { type: "module" });
  const r = await ask(worker, { url: textPdf(10), page: 1, width: W, height: H, options: {} });
  expect(r.error).toBeUndefined();
  expect([r.bitmap!.width, r.bitmap!.height]).toEqual([W, H]);

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  let t = performance.now();
  ctx.drawImage(r.bitmap!, 0, 0);
  const draw = performance.now() - t;
  ctx.getImageData(0, 0, 1, 1); // flush
  const px = ctx.getImageData(0, 0, W, H / 4).data;
  let dark = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] < 100) dark++;
  expect(dark).toBeGreaterThan(1000);

  // Main-thread frames while the worker renders pages 1–10.
  const frames: number[] = [], renders: number[] = [];
  let busy = true, last = performance.now();
  const tick = (now: number) => { frames.push(now - last); last = now; if (busy) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  t = performance.now();
  for (let p = 1; p <= 10; p++) {
    const x = await ask(worker, { page: p, width: W, height: H, options: {} });
    renders.push(x.ms!);
    ctx.drawImage(x.bitmap!, 0, 0);
    x.bitmap!.close();
  }
  busy = false;
  const total = performance.now() - t, f = stats(frames.slice(1)), rs = stats(renders);
  console.log(`S8: fonts in worker ${r.fonts}; first render ${r.ms!.toFixed(0)} ms, drawImage ${draw.toFixed(1)} ms; 10 pages ${total.toFixed(0)} ms ` +
    `(render p50 ${rs.p50.toFixed(0)} max ${rs.max.toFixed(0)}); frames ${frames.length} p50 ${f.p50.toFixed(1)} p95 ${f.p95.toFixed(1)} max ${f.max.toFixed(1)} ms; dark px ${dark}`);
  worker.terminate();
});
