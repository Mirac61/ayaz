import { panes, type Layout } from "./layout";

// What a folder looked like when it was last open: splits, the file and tabs per pane, the active pane,
// and where the cursor was in recently used files (like Vim's '" mark). Terminals come back as empty editors.
export interface Session {
  layout: Layout;
  panes: Record<number, string>;
  tabs: Record<number, string[]>;
  active: number;
  cursors: Record<string, number>; // path → offset, oldest first
}

const CURSORS = 200;
const key = (root: string) => `ayaz.session:${root}`;

export function loadSession(root: string): Session | null {
  try {
    return parseSession(localStorage.getItem(key(root)));
  } catch {
    return null; // storage blocked
  }
}

export function saveSession(root: string, s: Session) {
  try {
    localStorage.setItem(key(root), JSON.stringify(s));
  } catch { /* a convenience */ }
}

// null for anything that isn't a session this version wrote, so a broken entry just starts fresh.
export function parseSession(text: string | null): Session | null {
  let v: unknown;
  try {
    v = JSON.parse(text ?? "null");
  } catch {
    return null;
  }
  if (!isObj(v) || !isLayout(v.layout) || !isObj(v.panes) || !isObj(v.tabs) || !isObj(v.cursors)) return null;
  const ids = new Set(panes(v.layout).map(String));
  if (ids.size !== panes(v.layout).length) return null; // a pane twice
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((p): p is string => typeof p === "string") : []);
  const paneFile = (e: [string, unknown]): e is [string, string] => ids.has(e[0]) && typeof e[1] === "string";
  const offset = (e: [string, unknown]): e is [string, number] => Number.isInteger(e[1]) && (e[1] as number) >= 0;
  return {
    layout: v.layout,
    panes: Object.fromEntries(Object.entries(v.panes).filter(paneFile)),
    tabs: Object.fromEntries(Object.entries(v.tabs).filter(([id]) => ids.has(id)).map(([id, l]) => [id, strings(l)])),
    active: typeof v.active === "number" && ids.has(String(v.active)) ? v.active : panes(v.layout)[0],
    cursors: Object.fromEntries(Object.entries(v.cursors).filter(offset)),
  };
}

// Newer positions win and move to the end; only the last CURSORS files are kept.
export function mergeCursors(old: Record<string, number>, now: Record<string, number>) {
  const m = new Map(Object.entries(old));
  for (const [p, n] of Object.entries(now)) {
    m.delete(p);
    m.set(p, n);
  }
  return Object.fromEntries([...m].slice(-CURSORS));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isLayout(v: unknown): v is Layout {
  if (!isObj(v)) return false;
  if ("pane" in v) return Number.isInteger(v.pane) && (v.pane as number) > 0;
  const cs = v.children;
  if (v.dir !== "row" && v.dir !== "col" || !Array.isArray(cs) || cs.length < 2 || !cs.every(isLayout)) return false;
  const s = v.sizes;
  return s === undefined || Array.isArray(s) && s.length === cs.length && s.every((x) => typeof x === "number" && x > 0);
}
