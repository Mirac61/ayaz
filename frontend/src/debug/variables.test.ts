import { expect, test } from "vitest";
import { lines, rowOf, scopeRow, toggle } from "./variables";

const v = (name: string, value: string, ref = 0, type = "int") => ({ name, value, type, variablesReference: ref });

test("lines: scopes and variables with their values, types as hints, open rows with their children indented", () => {
  const children = [rowOf(v("i", "3")), rowOf(v("p", "*Point", 7, "*main.Point"))];
  const locals = { ...scopeRow({ name: "Locals", variablesReference: 1 }), open: true, children };
  expect(lines([locals]).map((l) => [l.label, l.hint])).toEqual([
    ["▾ Locals", ""],
    ["    i = 3".replace(" ", " "), "int"],
    ["  ▸ p = *Point", "*main.Point"],
  ]);
  locals.children[1].open = true;
  locals.children[1].children = [rowOf(v("X", "1")), rowOf(v("Y", "2"))];
  const shown = lines([locals]).map((l) => l.label);
  expect(shown).toEqual(["▾ Locals", "    i = 3", "  ▾ p = *Point", "      X = 1", "      Y = 2"]);
});

test("toggle loads the children once, then only flips", async () => {
  let loads = 0;
  const load = async (ref: number) => { loads++; return [v("a", `of ${ref}`)]; };
  const row = rowOf(v("s", "[]int len: 1", 5, "[]int"));
  await toggle(row, load);
  expect(row.open).toBe(true);
  expect(row.children?.map((c) => c.name)).toEqual(["a"]);
  await toggle(row, load);
  expect(row.open).toBe(false);
  await toggle(row, load);
  expect(row.open).toBe(true);
  expect(loads).toBe(1);
});

test("a variable with nothing below doesn't toggle", async () => {
  const row = rowOf(v("i", "1"));
  await toggle(row, async () => { throw new Error("must not load"); });
  expect(row.open).toBe(false);
});

test("Watch scope with evaluated expressions displays open with children", () => {
  const watchItems = [
    { name: "i + 1", value: "3", type: "int (watch)", ref: 0, open: false, isWatch: true },
    { name: "total", value: "6", type: "int (watch)", ref: 0, open: false, isWatch: true },
  ];
  const watchScope = {
    name: "Watch",
    value: "",
    ref: 0,
    open: true,
    children: watchItems,
    isWatchScope: true,
  };
  const shown = lines([watchScope]).map((l) => [l.label, l.hint]);
  expect(shown).toEqual([
    ["▾ Watch", ""],
    ["    i + 1 = 3", "int (watch)"],
    ["    total = 6", "int (watch)"],
  ]);
});
