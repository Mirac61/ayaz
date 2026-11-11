import { Text } from "@codemirror/state";
import { expect, test } from "vitest";
import { countWords, selectionSize } from "./words";

test("words are runs of non-space, across lines", () => {
  expect(countWords(Text.of(["", "  one two", "three\tfour  ", ""]))).toBe(4);
  expect(countWords(Text.of([""]))).toBe(0);
});

test("the count is kept for one document value", () => {
  const doc = Text.of(["a b"]);
  expect(countWords(doc)).toBe(2);
  expect(countWords(doc)).toBe(2);
  expect(countWords(doc.replace(3, 3, Text.of([" c"])))).toBe(3);
});

test("a very big document is not counted", () => {
  expect(countWords(Text.of(["word ".repeat(120_000)]))).toBeNull();
});

test("selection size: characters within a line, lines across lines, nothing when empty", () => {
  const doc = Text.of(["abc", "def", "ghi"]);
  expect(selectionSize(doc, 1, 1)).toBe("");
  expect(selectionSize(doc, 0, 1)).toBe("1 char");
  expect(selectionSize(doc, 0, 3)).toBe("3 chars");
  expect(selectionSize(doc, 1, 9)).toBe("3 lines");
});
