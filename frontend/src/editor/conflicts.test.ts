import { expect, test } from "vitest";
import { Text } from "@codemirror/state";
import { conflictAt, findConflicts, resolved } from "./conflicts";

const doc = (s: string) => Text.of(s.split("\n"));

const TWO = [
  "top", "<<<<<<< HEAD", "ours 1", "ours 2", "=======", "theirs 1", ">>>>>>> feature",
  "mid", "<<<<<<< HEAD", "a", "=======", ">>>>>>> feature", "end",
].join("\n");

test("complete blocks are found with their marker lines", () => {
  expect(findConflicts(doc(TWO))).toEqual([
    { start: 2, base: null, mid: 5, end: 7 },
    { start: 9, base: null, mid: 11, end: 12 },
  ]);
});

test("diff3 style has a base section", () => {
  const d = doc(["<<<<<<< HEAD", "o", "||||||| base", "b", "=======", "t", ">>>>>>> x"].join("\n"));
  expect(findConflicts(d)).toEqual([{ start: 1, base: 3, mid: 5, end: 7 }]);
  expect(resolved(d, findConflicts(d)[0], "ours")).toBe("o\n"); // not the base
});

test("half blocks, Markdown underlines and longer rows of equals are no conflict", () => {
  expect(findConflicts(doc("<<<<<<< HEAD\nours\n=======\nno end"))).toEqual([]);
  expect(findConflicts(doc("Title\n=======\ntext"))).toEqual([]);
  expect(findConflicts(doc("<<<<<<< HEAD\na\n========\nb\n>>>>>>> x"))).toEqual([]);
  expect(findConflicts(doc("======= \n<<<<<<<x\n>>>>>>> y"))).toEqual([]); // a marker needs a space or the line's end after it
});

test("ours, theirs and both, with empty sides", () => {
  const d = doc(TWO), [one, two] = findConflicts(d);
  expect(resolved(d, one, "ours")).toBe("ours 1\nours 2\n");
  expect(resolved(d, one, "theirs")).toBe("theirs 1\n");
  expect(resolved(d, one, "both")).toBe("ours 1\nours 2\ntheirs 1\n");
  expect(resolved(d, two, "theirs")).toBe(""); // theirs deleted it: the block goes
  expect(resolved(d, two, "both")).toBe("a\n");
});

test("the conflict at a line includes its marker lines", () => {
  const cs = findConflicts(doc(TWO));
  expect(conflictAt(cs, 2)).toBe(cs[0]);
  expect(conflictAt(cs, 7)).toBe(cs[0]);
  expect(conflictAt(cs, 8)).toBeNull();
  expect(conflictAt(cs, 1)).toBeNull();
});
