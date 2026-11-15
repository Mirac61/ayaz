import { expect, test } from "vitest";
import { ChangeSet, Text } from "@codemirror/state";
import { cleanupChanges } from "./cleanup";

const clean = (s: string, md = false) => {
  const doc = Text.of(s.split("\n"));
  return ChangeSet.of(cleanupChanges(doc, md), doc.length).apply(doc).toString();
};

test("trailing spaces and tabs go, one final newline", () => {
  expect(clean("a  \nb\t\nc")).toBe("a\nb\nc\n");
  expect(clean("a\n\n\n")).toBe("a\n");
  expect(clean("a \n  \n\t\n")).toBe("a\n");
  expect(clean("\tindent stays\n")).toBe("\tindent stays\n");
  expect(clean("a\n\nb\n")).toBe("a\n\nb\n"); // blank lines inside stay
});

test("clean files, empty and blank files are left alone", () => {
  for (const s of ["a\nb\n", "", "\n\n", "  "]) expect(cleanupChanges(Text.of(s.split("\n")), false)).toEqual([]);
});

test("a carriage return is no whitespace to trim", () => {
  expect(clean("a\r\nb\r\n")).toBe("a\r\nb\r\n");
});

test("Markdown keeps hard breaks (two or more spaces), trims the rest", () => {
  expect(clean("line  \nnext \nlast   \n", true)).toBe("line  \nnext\nlast\n"); // the last line breaks nothing
  expect(clean("a\t\n", true)).toBe("a\n");
  expect(clean("line  \n", false)).toBe("line\n");
});
