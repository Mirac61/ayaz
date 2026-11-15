import type { Summary } from "../core/backend";

// Text for the start page's detail block, from what git says about a recent folder.

const DAY = 86_400_000;

// "2 hours ago", "yesterday", "last week". Empty for entries from before the time was stored.
export function ago(then: number | undefined, now = Date.now()): string {
  if (!then) return "";
  const ms = Math.max(0, now - then);
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"} ago`;
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return n(Math.floor(ms / 60_000), "minute");
  if (ms < DAY) return n(Math.floor(ms / 3_600_000), "hour");
  if (ms < 2 * DAY) return "yesterday";
  if (ms < 7 * DAY) return n(Math.floor(ms / DAY), "day");
  if (ms < 14 * DAY) return "last week";
  if (ms < 30 * DAY) return n(Math.floor(ms / (7 * DAY)), "week");
  return ms < 60 * DAY ? "last month" : n(Math.floor(ms / (30 * DAY)), "month");
}

// "dev, 2 commits ahead", "main, up to date", "No git repository".
export function branchText(s: Summary): string {
  if (!s.repo) return "No git repository";
  const commits = (n: number) => `${n} commit${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (s.ahead) parts.push(`${commits(s.ahead)} ahead`);
  if (s.behind) parts.push(`${commits(s.behind)} behind`);
  return `${s.branch || "detached HEAD"}, ${parts.join(", ") || "up to date"}`;
}

export function changesText(s: Summary): string {
  const n = s.changed?.length ?? 0;
  return n === 0 ? "Nothing to commit" : `${n} file${n === 1 ? "" : "s"} not committed`;
}

// The names of up to three changed files, without their folders.
export function changedNames(s: Summary): string {
  return (s.changed ?? [])
    .slice(0, 3)
    .map((p) => p.split("/").pop())
    .join(", ");
}

// Deterministic night sky: dense at the top, none at the bottom, a few bigger warm stars.
export function sky(count = 170, w = 1200, h = 720) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, () => {
    const y = Math.pow(rnd(), 1.6) * h * 0.8;
    const big = rnd() > 0.94;
    return { x: rnd() * w, y, r: big ? 1.2 : 0.35 + rnd() * 0.5, big, o: (0.2 + rnd() * 0.5) * (1 - y / (h * 0.95)) };
  });
}

// Keeps a name inside the chart.
export const clip = (name: string, max = 14) => (name.length > max ? name.slice(0, max - 1) + "…" : name);
