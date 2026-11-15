// Generates testdata/big.md for the K3–K5 checks (docs/03-performance.md): 5,000 lines, deterministic.
// Run: node scripts/gen-bigmd.mjs
import { writeFileSync } from "node:fs";

const out = [];
const para = (i) => `Paragraph ${i} with **bold**, *emphasis*, \`inline code\` and a [link](https://example.org/${i}) in the middle of some plain text.`;
const table = (i) => ["| Name | Value | Note |", "|:-----|------:|:----:|", ...Array.from({ length: 6 }, (_, r) => `| row ${i}.${r} | ${r * i} | text |`), ""];
const code = (i) => ["```go", `func f${i}(x int) int {`, "\tif x > 0 {", "\t\treturn x * 2", "\t}", "\treturn 0", "}", "```", ""];
const list = (i) => [`- item ${i}.1`, `- [ ] todo ${i}.2`, `- [x] done ${i}.3`, `  - nested *${i}*`, `1. first`, `2. second`, ""];

let t = 0, c = 0, img = 0;
for (let s = 0; out.length < 5000; s++) {
  out.push(`${"#".repeat((s % 3) + 1)} Section ${s}`, "");
  out.push(para(s), para(s + 1), "");
  out.push(`> quote in section ${s}`, "", ...list(s));
  if (s % 10 === 0 && t < 20) out.push(...table(t++));
  if (s % 6 === 0 && c < 30) out.push(...code(c++));
  if (s % 4 === 0 && img < 50) out.push(`![figure ${img}](img/figure-${img++}.png)`, "");
  out.push("---", "");
}
writeFileSync(new URL("../testdata/big.md", import.meta.url), out.slice(0, 5000).join("\n") + "\n");
console.log({ lines: 5000, tables: t, codeBlocks: c, images: img });
