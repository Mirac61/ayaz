// Spike S4: binding round-trip latency. Throwaway, removed after M0.
import { backend } from "../core/backend";

import { stats, type Stats } from "./stats";

export type { Stats };

// WebKit rounds performance.now() to 1 ms, so time batches of calls and divide.
const BATCH = 20;

async function measure(call: () => Promise<unknown>, batches: number): Promise<Stats> {
  for (let i = 0; i < 50; i++) await call(); // warm-up
  const samples: number[] = [];
  for (let b = 0; b < batches; b++) {
    const t = performance.now();
    for (let i = 0; i < BATCH; i++) await call();
    samples.push((performance.now() - t) / BATCH);
  }
  return stats(samples);
}

export async function runS4(batches = 100) {
  return {
    empty: await measure(() => backend.ping(), batches),
    fifty: await measure(() => backend.matches(50), batches),
  };
}
