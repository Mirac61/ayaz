// Spikes S6 (terminal echo K13 and throughput K14) and S7 (stream echo K16). Throwaway, removed after M0.
import { backend } from "../core/backend";
import { openTerminal, type TermOptions } from "../terminal/terminal";
import { stats, type Stats } from "./bindingLatency";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (s: Stats) => `p50 ${s.p50.toFixed(2)} · p95 ${s.p95.toFixed(2)} · max ${s.max.toFixed(2)} ms`;

// Resolves once the terminal text contains marker.
function waitFor(read: () => string, marker: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const check = () => {
      if (read().includes(marker)) resolve();
      else if (performance.now() - t0 > timeoutMs) reject(new Error(`timeout waiting for ${marker}`));
      else setTimeout(check, 5);
    };
    check();
  });
}

export async function runS6(el: HTMLElement, opts: TermOptions): Promise<string> {
  const h = await openTerminal(el, opts);
  const buffer = h.term.buffer;
  const screen = () => {
    let s = "";
    for (let y = 0; y < h.term.rows; y++) s += buffer.active.getLine(buffer.active.viewportY + y)?.translateToString(true) + "\n";
    return s;
  };
  try {
    await sleep(1500); // let the login shell print its prompt

    // K13: key sent → next xterm render after the echo arrived.
    const lat: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      const rendered = new Promise<void>((resolve) => {
        const sub = h.term.onRender(() => { sub.dispose(); resolve(); });
      });
      h.input("a");
      await rendered;
      lat.push(performance.now() - t0);
      await sleep(15);
    }
    h.input("\x15"); // Ctrl-U clears the line

    // K14: seq 1 1000000 until the marker shows up. Quotes keep the typed command from matching.
    await sleep(200);
    const t0 = performance.now();
    h.input("seq 1 1000000; echo __DO''NE__\r");
    await waitFor(screen, "__DONE__", 60_000);
    const k14 = (performance.now() - t0) / 1000;

    return `S6 ${opts.renderer} window=${opts.windowMs ?? 4}ms max=${(opts.maxBytes ?? 16384) / 1024}KB: K13 ${fmt(stats(lat))} | K14 ${k14.toFixed(2)} s`;
  } finally {
    h.dispose();
  }
}

// K16: LSP-sized messages through the "echo" stream and back, timed in batches of 20 (1 ms timer resolution).
export async function runS7(): Promise<string> {
  const ws = backend.stream("echo");
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let pending: (() => void) | null = null;
  ws.onmessage = () => pending?.();
  const roundTrip = (msg: string) => new Promise<void>((r) => { pending = r; ws.send(msg); });

  const lsp = (bytes: number) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { text: "x".repeat(bytes) } });
    return `Content-Length: ${body.length}\r\n\r\n${body}`;
  };
  const out: string[] = [];
  for (const size of [200, 10_000, 200_000]) {
    const msg = lsp(size);
    for (let i = 0; i < 20; i++) await roundTrip(msg);
    const samples: number[] = [];
    for (let b = 0; b < 50; b++) {
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) await roundTrip(msg);
      samples.push((performance.now() - t0) / 20);
    }
    out.push(`${size / 1000}KB ${fmt(stats(samples))}`);
  }
  ws.close();
  return `S7 echo: ${out.join(" | ")}`;
}
