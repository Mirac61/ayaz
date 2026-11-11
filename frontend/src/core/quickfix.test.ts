import { expect, test } from "vitest";
import { Text } from "@codemirror/state";
import { hitPositions, label, Quickfix, replaceEdits, type Loc } from "./quickfix";

const loc = (path: string, line: number, col = 0, len = 1, text = "x"): Loc => ({ path, line, col, len, text });

test("sorted, :cn from the start, stops at both ends", () => {
  const q = new Quickfix();
  q.set("t", [loc("b", 1), loc("a", 9), loc("a", 2)]);
  expect(q.items.map((l) => `${l.path}${l.line}`)).toEqual(["a2", "a9", "b1"]);
  expect(q.move(-1)).toBeNull();
  expect(q.move(1)?.line).toBe(2);
  expect(q.move(1)?.line).toBe(9);
  expect(q.move(1)?.path).toBe("b");
  expect(q.move(1)).toBeNull();
  expect(q.index).toBe(2);
  expect(q.move(-1)?.line).toBe(9);
});

test("replaceEdits skips locations whose text moved", () => {
  const doc = Text.of(["foo foo", "bar", "😀foo"]);
  const { changes, skipped } = replaceEdits([
    loc("a", 1, 0, 3, "foo foo"), loc("a", 1, 4, 3, "foo foo"),
    loc("a", 2, 0, 3, "foo"), // line changed: bar
    loc("a", 3, 2, 3, "😀foo"), // UTF-16 column after the emoji
    loc("a", 9, 0, 3, "foo"), // line gone
  ], doc, "X");
  expect(skipped).toBe(2);
  expect(changes.map((c) => doc.sliceString(c.from, c.to))).toEqual(["foo", "foo", "foo"]);
});

test("replaceEdits expands $1, $2 after a regex search, a literal one stays literal", () => {
  const doc = Text.of(["var foo = 1"]);
  const l: Loc = { path: "a", line: 1, col: 4, len: 7, text: "var foo = 1", groups: ["foo", "1"] };
  expect(replaceEdits([l], doc, "$2 = $1 $$ $0 $3", true).changes[0].insert).toBe("1 = foo $ foo = 1 ");
  expect(replaceEdits([l], doc, "$2 = $1 $$", false).changes[0].insert).toBe("$2 = $1 $$");
});

test("hitPositions marks the match inside the picker label", () => {
  const l = { path: "a.go", line: 3, col: 7, len: 4, text: "  x := beta()" }; // label: "a.go:3:8: x := beta()"
  const text = label(l);
  expect(hitPositions(l).map((i) => Array.from(text)[i]).join("")).toBe("beta");
  expect(hitPositions({ ...l, len: 0 })).toEqual([]);
  expect(hitPositions({ ...l, col: 0, len: 1 })).toEqual([]); // inside the leading whitespace
});
