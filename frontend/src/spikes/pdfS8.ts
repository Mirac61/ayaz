// S8 (AYAZ_SPIKE=s8): pdf.js renders in a module worker; reports whether it works in the native WebView and how fast.
import { backend } from "../core/backend";

export type Reply = { bitmap?: ImageBitmap; ms?: number; fonts?: boolean; error?: string };
export const W = 2392, H = 3098;

export const ask = (worker: Worker, msg: object) =>
  new Promise<Reply>((ok) => { worker.onmessage = (e) => ok(e.data); worker.postMessage(msg); });

// Pages in the format of scripts/gen-bigpdf.mjs.
export function textPdf(pages: number) {
  const objs: string[] = [];
  const add = (s: string) => objs.push(s);
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pagesId = pages * 2 + 2, kids: number[] = [];
  for (let p = 1; p <= pages; p++) {
    const lines = [`Page ${p} of ${pages}`, ""];
    for (let l = 0; l < 40; l++) lines.push(`Line ${l + 1} on page ${p}: the quick brown fox jumps over the lazy dog ${p * 100 + l}.`);
    const text = lines.map((t, i) => `BT /F1 ${i ? 10 : 18} Tf 50 ${770 - i * 17} Td (${t}) Tj ET`).join("\n");
    const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
  }
  add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${pages} >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return URL.createObjectURL(new Blob([Uint8Array.from(out, (c) => c.charCodeAt(0))], { type: "application/pdf" }));
}


export async function runS8() {
  const worker = new Worker(new URL("./pdfS8.worker.ts", import.meta.url), { type: "module" });
  const r = await ask(worker, { url: textPdf(10), page: 1, width: W, height: H, options: {} });
  if (r.error) return backend.report(`s8: fails: ${r.error}`);
  const ctx = Object.assign(document.createElement("canvas"), { width: W, height: H }).getContext("2d", { alpha: false })!;
  const t = performance.now();
  ctx.drawImage(r.bitmap!, 0, 0);
  const draw = performance.now() - t;
  const px = ctx.getImageData(0, 0, W, H / 4).data;
  let dark = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] < 100) dark++;
  const renders: number[] = [];
  for (let p = 1; p <= 10; p++) {
    const x = await ask(worker, { page: p, width: W, height: H, options: {} });
    renders.push(x.ms!);
    x.bitmap!.close();
  }
  worker.terminate();
  await backend.report(`s8: works (${r.bitmap!.width}×${r.bitmap!.height}, dark px ${dark}, fonts in worker ${r.fonts}); first render ${r.ms!.toFixed(0)} ms, ` +
    `drawImage ${draw.toFixed(1)} ms, 10 pages ${renders.map((m) => m.toFixed(0)).join(" ")} ms`);
}
