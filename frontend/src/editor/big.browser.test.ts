import { expect, test } from "vitest";
import { EditorView } from "@codemirror/view";
import { createState } from "./editor";
import big from "../../../testdata/big.md?raw";
import { budget } from "./budget";

const frame = () => new Promise<number>((r) => requestAnimationFrame(r));

// A coarse K3–K5 check on big.md (docs/03-performance.md): headless WebKit, not the app, so no real budget.
test("big.md opens and scrolls to the end without errors or slow frames", async () => {
  const errors: unknown[] = [];
  const onError = (e: ErrorEvent | PromiseRejectionEvent) => errors.push("reason" in e ? e.reason : e.error);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onError);
  const el = document.createElement("div");
  el.style.cssText = "height:600px;width:800px";
  document.body.append(el);

  const t0 = performance.now();
  const view = new EditorView({ parent: el, state: await createState("big.md", big) });
  await frame();
  await frame();
  const open = performance.now() - t0;

  const deltas: number[] = [];
  let last = await frame();
  for (let i = 0; i < 3000; i++) {
    const before = view.scrollDOM.scrollTop;
    view.scrollDOM.scrollTop += 300;
    const now = await frame();
    deltas.push(now - last);
    last = now;
    if (view.scrollDOM.scrollTop === before) break; // at the end
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  const worst = sorted[sorted.length - 1], p95 = sorted[Math.floor(sorted.length * 0.95)];
  console.log(`BIGMD open ${open.toFixed(0)} ms, ${deltas.length} frames, p95 ${p95.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`);

  const atEnd = view.scrollDOM.scrollTop + view.scrollDOM.clientHeight >= view.scrollDOM.scrollHeight - 2;
  view.destroy();
  el.remove();
  window.removeEventListener("error", onError);
  window.removeEventListener("unhandledrejection", onError);
  expect(errors).toEqual([]);
  expect(atEnd).toBe(true);
  expect(worst).toBeLessThan(budget(50));
}, 60_000);
