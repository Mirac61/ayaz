import { expect, test } from "vitest";
import { close, neighbor, panes, split, type Layout } from "./layout";

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
