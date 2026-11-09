import { expect, test } from "vitest";
import { Text } from "@codemirror/state";
import { Quickfix, replaceEdits, type Loc } from "./quickfix";

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
