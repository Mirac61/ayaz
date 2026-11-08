// Pane layout as a tree: leaves are panes, "row" puts children side by side (:vsplit), "col" stacks them (:split).
// Panes only show buffers; a buffer can be in several panes (buffers live in core/buffers).

export type Layout = { pane: number } | { dir: "row" | "col"; children: Layout[] };
export type Dir = "left" | "down" | "up" | "right";

export const panes = (l: Layout): number[] => ("pane" in l ? [l.pane] : l.children.flatMap(panes));

// Puts pane `nid` right after `id` (splitright/splitbelow from my nvim config).
export function split(l: Layout, id: number, dir: "row" | "col", nid: number): Layout {
  if ("pane" in l) return l.pane === id ? { dir, children: [l, { pane: nid }] } : l;
  const i = l.children.findIndex((c) => "pane" in c && c.pane === id);
  if (i >= 0 && l.dir === dir) return { dir, children: [...l.children.slice(0, i + 1), { pane: nid }, ...l.children.slice(i + 1)] };
  return { dir: l.dir, children: l.children.map((c) => split(c, id, dir, nid)) };
}

// Removes a pane; a node left with one child is replaced by it. null when the last pane closes.
export function close(l: Layout, id: number): Layout | null {
  if ("pane" in l) return l.pane === id ? null : l;
  const children = l.children.map((c) => close(c, id)).filter((c): c is Layout => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { dir: l.dir, children };
}

interface Rect { x: number; y: number; w: number; h: number }

// Pane rectangles in the unit square; children share their parent equally (no resizing yet).
export function rects(l: Layout, r: Rect = { x: 0, y: 0, w: 1, h: 1 }, out = new Map<number, Rect>()) {
  if ("pane" in l) return out.set(l.pane, r);
  const n = l.children.length;
  l.children.forEach((c, i) =>
    rects(c, l.dir === "row"
      ? { x: r.x + (r.w / n) * i, y: r.y, w: r.w / n, h: r.h }
      : { x: r.x, y: r.y + (r.h / n) * i, w: r.w, h: r.h / n }, out));
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
