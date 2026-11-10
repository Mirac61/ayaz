import { expect, test } from "vitest";
import { EditorView } from "@codemirror/view";
import { createState, hasLongLine, LONG_LINE } from "./editor";
import { setHead } from "./gitgutter";

const frame = () => new Promise<number>((r) => requestAnimationFrame(r));

// M51: what a 10 MB file and a 1 MB line cost (docs/perf-log.md). Headless WebKit, so the numbers are coarse.
const goFile = () => {
  const fn = (i: number) => `func handler${i}(w http.ResponseWriter, r *http.Request) {\n\tif r.Method != "GET" {\n` +
    `\t\thttp.Error(w, "method", 405)\n\t\treturn\n\t}\n\tfmt.Fprintf(w, "hello %d", ${i})\n}\n\n`;
  let s = "package main\n\n";
  for (let i = 0; s.length < 10 << 20; i++) s += fn(i);
  return s;
};
const minified = () => {
  let s = "";
  for (let i = 0; s.length < 1 << 20; i++) s += `function f${i}(a,b){return a.map(x=>x*${i}+b).filter(Boolean)};var v${i}={k:"${i}",n:[1,2,3]};`;
  return s;
};

async function measure(name: string, path: string, doc: string) {
  const el = document.createElement("div");
  el.style.cssText = "height:600px;width:800px";
  document.body.append(el);
  let t = performance.now();
  const view = new EditorView({ parent: el, state: await createState(path, doc) });
  await frame();
  await frame();
  const open = performance.now() - t;
  t = performance.now();
  view.dispatch({ effects: setHead.of(view.state.doc) }); // the git gutter's HEAD text: same as the file
  await frame();
  const head = performance.now() - t;

  // Main-thread work per key: the transaction, the DOM update and a forced layout (frames are rounded to 16.7 ms here).
  const type = async (at: number) => {
    const out: number[] = [];
    view.dispatch({ selection: { anchor: at } });
    await frame();
    for (let i = 0; i < 20; i++) {
      const head = view.state.selection.main.head;
      t = performance.now();
      view.dispatch({ changes: { from: head, insert: "x" }, selection: { anchor: head + 1 } });
      void view.contentDOM.offsetHeight;
      out.push(performance.now() - t);
      await frame();
    }
    return out;
  };
  const typing = await type(0);
  const typingEnd = await type(view.state.doc.line(1).to); // the minified line's end

  const deltas: number[] = [];
  let last = await frame();
  for (let i = 0; i < 400; i++) {
    view.scrollDOM.scrollTop += 2000;
    const now = await frame();
    deltas.push(now - last);
    last = now;
  }
  t = performance.now();
  view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true }); // G
  await frame();
  await frame();
  const end = performance.now() - t;
  const p95 = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)];
  const max = (a: number[]) => Math.max(...a);
  console.warn(`LARGE ${name}: open ${open.toFixed(0)} ms, git head ${head.toFixed(0)} ms, typing p95 ${p95(typing).toFixed(1)} max ${max(typing).toFixed(1)} ms, ` +
    `at line 1's end p95 ${p95(typingEnd).toFixed(1)} ms, ` +
    `scroll p95 ${p95(deltas).toFixed(1)} max ${max(deltas).toFixed(1)} ms, G ${end.toFixed(0)} ms`);
  view.destroy();
  el.remove();
  return { open, typing: p95(typing), scroll: p95(deltas) };
}

test("long lines: the limit counts characters between newlines", () => {
  expect(hasLongLine("a\n".repeat(100_000))).toBe(false);
  expect(hasLongLine("x".repeat(LONG_LINE))).toBe(false);
  expect(hasLongLine("short\n" + "x".repeat(LONG_LINE + 1))).toBe(true);
  expect(hasLongLine("x".repeat(LONG_LINE + 1) + "\nshort")).toBe(true);
});

// Numbers for docs/perf-log.md come from the warnings; the gate is the per-key work.
test("a 10 MB Go file and a 1 MB line type in under a 120 Hz frame", async () => {
  const go = goFile(), min = minified();
  expect((await measure("10 MB .go", "big.go", go)).typing).toBeLessThan(8);
  expect((await measure("1 MB line .js", "min.js", min)).typing).toBeLessThan(8); // opens as plain text
}, 300_000);
