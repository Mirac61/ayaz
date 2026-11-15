// FPS (AYAZ_SPIKE=fps): scrolls the open file and the file tree like a fast trackpad, one scripted step per frame, and reports the
// frame times as "fps: <view> ...". Start it with a long file: `AYAZ_SPIKE=fps bin/ayaz frontend/src/shell/Workbench.tsx`.
// Frame times only mean something in a visible window (hidden workspaces pause requestAnimationFrame).
import { backend } from "../core/backend";
import { stats } from "./stats";

const SPEED = 8000; // px per second, like K8
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (find: () => HTMLElement | null) => { for (let el; ; await sleep(100)) if ((el = find())) return el; };

async function scroll(view: string, box: HTMLElement) {
  box.scrollTop = 0;
  await sleep(500);
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
  const s = stats(frames);
  await backend.report(`fps: ${view} (${box.scrollHeight} px, ${frames.length} frames, p50 ${s.p50.toFixed(1)} · p95 ${s.p95.toFixed(1)} · ` +
    `max ${s.max.toFixed(1)} ms, ${frames.filter((f) => f > 17).length} over 17 ms)`);
}

export async function runFps() {
  await sleep(3_000);
  await scroll("editor", await until(() => document.querySelector<HTMLElement>(".cm-scroller")));
  await scroll("tree", await until(() => document.querySelector<HTMLElement>("[role=tree]")));
  await backend.report("fps: done");
}
