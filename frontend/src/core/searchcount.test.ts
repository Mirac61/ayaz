import { Text } from "@codemirror/state";
import { expect, test } from "vitest";
import { searchCount } from "./searchcount";

const doc = Text.of(["alpha beta", "beta gamma", "beta"]); // "beta" starts at 6, 11 and 22

test("the match at or before the cursor, out of all", () => {
  expect(searchCount(doc, /beta/, 6)).toBe("1/3");
  expect(searchCount(doc, /beta/, 12)).toBe("2/3");
  expect(searchCount(doc, /beta/, doc.length)).toBe("3/3");
});

test("before the first match counts as the first", () => {
  expect(searchCount(doc, /beta/, 0)).toBe("1/3");
});

test("no match is 0/0", () => {
  expect(searchCount(doc, /zeta/, 0)).toBe("0/0");
});

test("flags other than g are kept, and a global query works too", () => {
  expect(searchCount(doc, /BETA/i, 22)).toBe("3/3");
  expect(searchCount(doc, /beta/g, 22)).toBe("3/3");
});

test("many matches stop at a limit and say so", () => {
  const many = Text.of(["a".repeat(3000)]);
  expect(searchCount(many, /a/, 5)).toBe("6/1000+");
});
