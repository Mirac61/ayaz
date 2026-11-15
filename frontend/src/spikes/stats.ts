// Percentiles for spike measurements.
export interface Stats { p50: number; p95: number; max: number }

export function stats(samples: number[]): Stats {
  const s = [...samples].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { p50: at(0.5), p95: at(0.95), max: s[s.length - 1] };
}
