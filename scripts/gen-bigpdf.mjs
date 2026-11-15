// Generates testdata/e2e-ws/big.pdf for the K6–K8 checks (docs/03-performance.md): 200 text pages, deterministic.
// Page 150 holds the word "zanzibar" once, for the search check. Run: node scripts/gen-bigpdf.mjs
import { writeFileSync } from "node:fs";

const PAGES = 200;
const objs = []; // index i is object i + 1
const add = (s) => objs.push(s) && objs.length;

const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const pagesId = PAGES * 2 + 2; // after the font and each page's content + page objects
const kids = [];
for (let p = 1; p <= PAGES; p++) {
  const lines = [`Page ${p} of ${PAGES}`, ""];
  for (let l = 0; l < 40; l++) lines.push(`Line ${l + 1} on page ${p}: the quick brown fox jumps over the lazy dog ${p * 100 + l}.`);
  if (p === 150) lines[20] = "Here is the needle: zanzibar.";
  const text = lines.map((t, i) => `BT /F1 ${i ? 10 : 18} Tf 50 ${770 - i * 17} Td (${t}) Tj ET`).join("\n");
  const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
}
if (add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${PAGES} >>`) !== pagesId) throw new Error("object numbering");
const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

let out = "%PDF-1.4\n";
const offsets = objs.map((o, i) => {
  const at = out.length;
  out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  return at;
});
const xref = out.length;
out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(new URL("../testdata/e2e-ws/big.pdf", import.meta.url), out, "latin1");
console.log(`testdata/e2e-ws/big.pdf: ${PAGES} pages, ${out.length} bytes`);
