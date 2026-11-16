import { expect, test } from "vitest";
import { Text } from "@codemirror/state";
import { cursorAt } from "./editors";

const doc = Text.of(["one", "two"]);

test("column 0 and below land at the start of the line, not the end of the one before", () => {
  expect(cursorAt(doc, 2, 0)).toBe(4);
  expect(cursorAt(doc, 2, -1)).toBe(4);
});

test("line and column clamp into the document", () => {
  expect(cursorAt(doc, 9, 99)).toBe(7);
  expect(cursorAt(doc, 0, 1)).toBe(1);
});
