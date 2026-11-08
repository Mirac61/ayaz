import { expect, test } from "vitest";
import { borders, close, equalize, neighbor, panes, rects, resize, setBorder, split, type Layout } from "./layout";

// 1 | 2      :vsplit from 1, then :split from 2
//   | 3
const l: Layout = split(split({ pane: 1 }, 1, "row", 2), 2, "col", 3);

test("split puts the new pane after, and nests only on a direction change", () => {
  expect(l).toEqual({ dir: "row", children: [{ pane: 1 }, { dir: "col", children: [{ pane: 2 }, { pane: 3 }] }] });
  const col = { dir: "col", children: [{ pane: 2 }, { pane: 3 }] };
  expect(split(l, 1, "row", 4)).toEqual({ dir: "row", children: [{ pane: 1 }, { pane: 4 }, col] });
  expect(panes(l)).toEqual([1, 2, 3]);
});

test("close collapses single children and returns null for the last pane", () => {
  expect(close(l, 3)).toEqual({ dir: "row", children: [{ pane: 1 }, { pane: 2 }] });
  expect(close(close(l, 3)!, 1)).toEqual({ pane: 2 });
  expect(close({ pane: 1 }, 1)).toBeNull();
  expect(close(l, 99)).toEqual(l);
});

test("neighbor moves like Ctrl-w h/j/k/l and stops at the edge", () => {
  expect(neighbor(l, 1, "right")).toBe(2); // touches 2 and 3 equally → the top one
  expect(neighbor(l, 3, "left")).toBe(1);
  expect(neighbor(l, 2, "down")).toBe(3);
  expect(neighbor(l, 3, "up")).toBe(2);
  expect(neighbor(l, 1, "left")).toBeNull();
  expect(neighbor(l, 2, "right")).toBeNull();
  expect(neighbor({ pane: 1 }, 1, "up")).toBeNull();
});

// 1 | 2 | 3, then 3 dragged wide
const three: Layout = split(split({ pane: 1 }, 1, "row", 2), 2, "row", 3);
const near = (xs: number[]) => xs.map((x) => Math.round(x * 1000) / 1000);
const sizes = (x: Layout) => ("pane" in x ? [] : near(x.sizes ?? []));

test("rects follow sizes; borders sit between children", () => {
  const l2 = setBorder(l, [], 0, 0.25);
  expect(rects(l2).get(1)).toEqual({ x: 0, y: 0, w: 0.25, h: 1 });
  expect(rects(l2).get(3)).toEqual({ x: 0.25, y: 0.5, w: 0.75, h: 0.5 });
  expect(borders(l2).map((b) => [b.path, b.i, b.dir, b.at.x, b.at.y])).toEqual([[[], 0, "row", 0.25, 0], [[1], 0, "col", 0.25, 0.5]]);
});

test("setBorder moves only its two children and keeps a minimum", () => {
  expect(sizes(setBorder(three, [], 1, 0.5))).toEqual([0.333, 0.167, 0.5]);
  expect(sizes(setBorder(three, [], 0, 0))).toEqual([0.05, 0.617, 0.333]);
  expect(sizes(setBorder(three, [], 0, 1))).toEqual([0.617, 0.05, 0.333]);
  const nested = setBorder(l, [1], 0, 0.8);
  expect("pane" in nested ? [] : sizes(nested.children[1])).toEqual([0.8, 0.2]);
});

test("resize takes from the next sibling, the previous for the last, in the innermost split of that direction", () => {
  expect(sizes(resize(three, 1, "row", 0.1))).toEqual([0.433, 0.233, 0.333]);
  expect(sizes(resize(three, 3, "row", 0.1))).toEqual([0.333, 0.233, 0.433]);
  expect(sizes(resize(three, 1, "row", -1))).toEqual([0.05, 0.617, 0.333]);
  expect(resize(three, 1, "col", 0.1)).toEqual(three); // no split in that direction
  const r = resize(l, 3, "col", 0.1); // the col inside the row
  expect("pane" in r ? [] : [sizes(r), sizes(r.children[1])]).toEqual([[], [0.4, 0.6]]);
  expect(sizes(resize(l, 3, "row", 0.1))).toEqual([0.4, 0.6]); // the outer row
});

test("split halves the pane it splits, close hands its share to the rest, equalize resets", () => {
  const wide = setBorder(three, [], 1, 0.5); // .333 .167 .5
  expect(sizes(split(wide, 3, "row", 4))).toEqual([0.333, 0.167, 0.25, 0.25]);
  expect(sizes(close(wide, 2)!)).toEqual([0.4, 0.6]);
  expect(equalize(wide)).toEqual(three);
  expect(panes(equalize(wide))).toEqual([1, 2, 3]);
});

test("neighbor still finds panes after resizing", () => {
  const l2 = setBorder(resize(l, 3, "col", 0.2), [], 0, 0.3);
  expect(neighbor(l2, 1, "right")).toBe(3); // 3 now overlaps 1 most
  expect(neighbor(l2, 2, "down")).toBe(3);
});
