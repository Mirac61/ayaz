// K8 (AYAZ_SPIKE=k8): drives the editor like a user would. Reports "k8: before" with the folder open and idle, then opens
// big.pdf, scrolls through all 200 pages like a fast trackpad and reports "k8: after" with the frame times while scrolling.
// scripts/ram.sh measures RAM at each report.
import { backend } from "../core/backend";
import { stats } from "./stats";

const SPEED = 8000; // px per second
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const status = () => document.querySelector(".statusline .location")?.textContent ?? "";
const until = async (ok: () => boolean) => { while (!ok()) await sleep(100); };

export async function runK8() {
  await sleep(10_000); // idle, like K2
  await backend.report("k8: before");
  await sleep(3_000); // ram.sh measures meanwhile
  [...document.querySelectorAll<HTMLElement>("[role=treeitem]")].find((e) => e.textContent?.endsWith("big.pdf"))!.click();
  await until(() => status().startsWith("page 1/200"));
  const box = document.querySelector<HTMLElement>(".pdf-viewer")!;
  const frames: number[] = [];
  await new Promise<void>((done) => {
    let last = performance.now();
    const tick = (now: number) => {
      frames.push(now - last);
      box.scrollTop += (SPEED * (now - last)) / 1000;
      last = now;
      if (box.scrollTop + box.clientHeight < box.scrollHeight - 1) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  await until(() => status().startsWith("page 200/200"));
  await sleep(3_000);
  const s = stats(frames);
  await backend.report(`k8: after (pane ${box.clientWidth}×${box.clientHeight}, ${document.querySelectorAll(".pdf-viewer canvas").length} canvases; ${frames.length} frames, ` +
    `p50 ${s.p50.toFixed(1)} · p95 ${s.p95.toFixed(1)} · max ${s.max.toFixed(1)} ms)`);
}
