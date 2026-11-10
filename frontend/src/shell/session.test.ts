import { expect, test } from "vitest";
import { mergeCursors, parseSession } from "./session";

const layout = { dir: "row", children: [{ pane: 1 }, { pane: 2 }], sizes: [0.3, 0.7] };

test("parseSession keeps a valid session and drops entries of panes that aren't in the layout", () => {
  const s = parseSession(JSON.stringify({
    layout,
    panes: { 1: "a.go", 2: 7, 5: "gone.go" },
    tabs: { 1: ["a.go", 3, "b.go"], 9: ["x"] },
    active: 2,
    cursors: { "a.go": 12, "b.go": -1, "c.go": 1.5 },
  }));
  expect(s).toEqual({
    layout, panes: { 1: "a.go" }, tabs: { 1: ["a.go", "b.go"] }, active: 2, cursors: { "a.go": 12 }, previews: [], terms: {},
  });
});

test("parseSession keeps previews and terminals of panes in the layout", () => {
  const s = parseSession(JSON.stringify({
    layout, panes: { 1: "a.md" }, tabs: {}, active: 1, cursors: {},
    previews: [1, 9, "x"], terms: { 2: "", 7: "lazygit", 1: 3 },
  }));
  expect(s?.previews).toEqual([1]);
  expect(s?.terms).toEqual({ 2: "" });
});

test("parseSession rejects broken input and falls back to the first pane", () => {
  const ok = { layout, panes: {}, tabs: {}, cursors: {} };
  for (const bad of [null, "", "{", "[]", JSON.stringify({ ...ok, layout: { pane: -1 } }),
    JSON.stringify({ ...ok, layout: { dir: "row", children: [{ pane: 1 }] } }),
    JSON.stringify({ ...ok, layout: { dir: "row", children: [{ pane: 1 }, { pane: 1 }] } }),
    JSON.stringify({ ...ok, layout: { ...layout, sizes: [1] } }),
    JSON.stringify({ ...ok, panes: [] })])
    expect(parseSession(bad)).toBeNull();
  expect(parseSession(JSON.stringify({ ...ok, active: 99 }))?.active).toBe(1);
});

test("mergeCursors: newer wins and moves to the end, at most 200 files", () => {
  expect(Object.keys(mergeCursors({ a: 1, b: 2 }, { a: 5 }))).toEqual(["b", "a"]);
  const many = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`f${i}`, i]));
  const m = mergeCursors(many, { new: 1 });
  expect(Object.keys(m)).toHaveLength(200);
  expect(m.new).toBe(1);
  expect(m.f0).toBeUndefined();
});
