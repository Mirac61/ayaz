// One-off: wraps the body of if/else/for/while/do in braces on their own lines (what oxlint's curly rule wants),
// without touching any other formatting. Usage: bun scripts/add-curly.mjs <files...>
import ts from "../frontend/node_modules/typescript/lib/typescript.js";
import { readFileSync, writeFileSync } from "node:fs";

let skipped = 0;
for (const file of process.argv.slice(2)) {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = []; // {start, end, text}
  const lineIndent = (pos) => {
    const ls = src.lastIndexOf("\n", pos - 1) + 1;
    return /^[ \t]*/.exec(src.slice(ls))[0];
  };
  const wrap = (stmt, ownerPos) => {
    if (ts.isBlock(stmt)) return;
    const text = src.slice(stmt.getStart(sf), stmt.end);
    let multiLiteral = false;
    const scan = (n) => {
      if ((ts.isTemplateLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isStringLiteral(n)) && n.getText(sf).includes("\n")) multiLiteral = true;
      ts.forEachChild(n, scan);
    };
    scan(stmt);
    if (multiLiteral) { console.error(`SKIP ${file}:${sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1} (multi-line literal)`); skipped++; return; }
    const ind = lineIndent(ownerPos);
    const body = text.split("\n").map((l, i) => (i === 0 ? l : l.length ? "  " + l : l)).join("\n");
    // Replace from the token after the keyword's header (condition or else) up to the end of the statement.
    edits.push({ start: stmt.pos, end: stmt.end, text: ` {\n${ind}  ${body}\n${ind}}` });
  };
  const visit = (n) => {
    if (ts.isIfStatement(n)) {
      wrap(n.thenStatement, n.getStart(sf));
      if (n.elseStatement && !ts.isIfStatement(n.elseStatement)) wrap(n.elseStatement, n.elseStatement.pos - 4 >= 0 ? src.lastIndexOf("else", n.elseStatement.pos) : n.getStart(sf));
    } else if (ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) || ts.isWhileStatement(n)) wrap(n.statement, n.getStart(sf));
    else if (ts.isDoStatement(n)) wrap(n.statement, n.getStart(sf));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // Nested bodies: apply the outer edit last-to-first; an inner edit inside an outer range is dropped and picked up by a rerun.
  edits.sort((a, b) => b.start - a.start);
  let out = src, last = Infinity;
  for (const e of edits) {
    if (e.end > last) continue;
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    last = e.start;
  }
  if (out !== src) writeFileSync(file, out);
}
if (skipped) console.error(`${skipped} skipped, fix by hand`);
