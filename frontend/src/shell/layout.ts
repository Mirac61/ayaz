// Pane layout as a tree: leaves are panes, "row" puts children side by side (:vsplit), "col" stacks them (:split).
// Panes only show buffers; a buffer can be in several panes (buffers live in core/buffers).

// sizes: each child's share of the parent, summing to 1; missing means equal shares (<C-w>=).
export type Layout = { pane: number } | Split;
type Split = { dir: "row" | "col"; children: Layout[]; sizes?: number[] };
export type Dir = "left" | "down" | "up" | "right";

export const panes = (l: Layout): number[] => ("pane" in l ? [l.pane] : l.children.flatMap(panes));

// Puts pane `nid` right after `id` (splitright/splitbelow from my nvim config), before it for a drop on the left or top edge.
export function split(l: Layout, id: number, dir: "row" | "col", nid: number, before = false): Layout {
  if ("pane" in l) return l.pane === id ? { dir, children: before ? [{ pane: nid }, l] : [l, { pane: nid }] } : l;
  const i = l.children.findIndex((c) => "pane" in c && c.pane === id);
  if (i >= 0 && l.dir === dir) {
    const s = sizesOf(l); // like Vim, the new pane takes half of the one it splits
    return {
      dir,
      children: [...l.children.slice(0, i + +!before), { pane: nid }, ...l.children.slice(i + +!before)],
      ...(l.sizes && { sizes: [...s.slice(0, i), s[i] / 2, s[i] / 2, ...s.slice(i + 1)] }),
    };
  }
  return { ...l, children: l.children.map((c) => split(c, id, dir, nid, before)) };
}

// Removes a pane; a node left with one child is replaced by it. null when the last pane closes.
export function close(l: Layout, id: number): Layout | null {
  if ("pane" in l) return l.pane === id ? null : l;
  const kept = l.children.map((c, i) => [close(c, id), sizesOf(l)[i]] as const).filter(([c]) => c !== null);
  if (kept.length === 0) return null;
  if (kept.length === 1) return kept[0][0];
  const sum = kept.reduce((a, [, s]) => a + s, 0); // the closed pane's share goes to the rest
  return { dir: l.dir, children: kept.map(([c]) => c!), ...(l.sizes && { sizes: kept.map(([, s]) => s / sum) }) };
}

const sizesOf = (l: Split) => l.sizes ?? l.children.map(() => 1 / l.children.length);
const MIN = 0.05; // smallest share a drag or <C-w>- leaves a pane

// <C-w>=: equal shares everywhere.
export function equalize(l: Layout): Layout {
  return "pane" in l ? l : { dir: l.dir, children: l.children.map(equalize) };
}

// <C-w>+/-/</>: grows pane id by delta (share of its parent) along dir, taken from the next sibling (the previous for the last).
// The innermost split in that direction resizes, like Vim.
export function resize(l: Layout, id: number, dir: "row" | "col", delta: number): Layout {
  if ("pane" in l) return l;
  const i = l.children.findIndex((c) => panes(c).includes(id));
  if (i < 0) return l;
  const inner = resize(l.children[i], id, dir, delta);
  if (inner !== l.children[i]) return { ...l, children: l.children.map((c, k) => (k === i ? inner : c)) };
  if (l.dir !== dir) return l;
  const s = [...sizesOf(l)], j = i + 1 < s.length ? i + 1 : i - 1;
  const d = Math.max(-(s[i] - MIN), Math.min(delta, s[j] - MIN));
  s[i] += d;
  s[j] -= d;
  return { ...l, sizes: s };
}

// Drag: puts the border after child i of the split at `path` at position `at` (0..1 within that split).
export function setBorder(l: Layout, path: number[], i: number, at: number): Layout {
  if ("pane" in l) return l;
  if (path.length) return { ...l, children: l.children.map((c, k) => (k === path[0] ? setBorder(c, path.slice(1), i, at) : c)) };
  const s = [...sizesOf(l)];
  const before = s.slice(0, i).reduce((a, b) => a + b, 0), pair = s[i] + s[i + 1];
  s[i] = Math.max(MIN, Math.min(at - before, pair - MIN));
  s[i + 1] = pair - s[i];
  return { ...l, sizes: s };
}

export interface Rect { x: number; y: number; w: number; h: number }

function childRects(l: Split, r: Rect): Rect[] {
  let at = 0;
  return sizesOf(l).map((s) => {
    const c = l.dir === "row" ? { x: r.x + r.w * at, y: r.y, w: r.w * s, h: r.h } : { x: r.x, y: r.y + r.h * at, w: r.w, h: r.h * s };
    at += s;
    return c;
  });
}

// Pane rectangles in the unit square.
export function rects(l: Layout, r: Rect = { x: 0, y: 0, w: 1, h: 1 }, out = new Map<number, Rect>()) {
  if ("pane" in l) return out.set(l.pane, r);
  const cs = childRects(l, r);
  l.children.forEach((c, i) => rects(c, cs[i], out));
  return out;
}

// The draggable borders: after child i of the split at path, which fills rect r.
export interface Border { path: number[]; i: number; dir: "row" | "col"; r: Rect; at: Rect }
export function borders(l: Layout, r: Rect = { x: 0, y: 0, w: 1, h: 1 }, path: number[] = [], out: Border[] = []) {
  if ("pane" in l) return out;
  const cs = childRects(l, r);
  l.children.forEach((c, i) => {
    if (i > 0) out.push({ path, i: i - 1, dir: l.dir, r, at: cs[i] });
    borders(c, cs[i], [...path, i], out);
  });
  return out;
}

const EPS = 1e-9;

// The pane next to `id` in direction d (Ctrl-w h/j/k/l), or null at the edge.
// Of several touching panes it picks the one that overlaps most, then the top/left one.
export function neighbor(l: Layout, id: number, d: Dir): number | null {
  const rs = rects(l);
  const a = rs.get(id);
  if (!a) return null;
  let best: number | null = null, bestOverlap = EPS;
  for (const [pid, b] of rs) {
    const touches =
      d === "left" ? Math.abs(b.x + b.w - a.x) < EPS :
      d === "right" ? Math.abs(a.x + a.w - b.x) < EPS :
      d === "up" ? Math.abs(b.y + b.h - a.y) < EPS :
      Math.abs(a.y + a.h - b.y) < EPS;
    if (!touches) continue;
    const overlap = d === "left" || d === "right"
      ? Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      : Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    if (overlap > bestOverlap + EPS) { best = pid; bestOverlap = overlap; }
  }
  return best;
}
