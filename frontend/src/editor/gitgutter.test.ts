import { expect, test } from "vitest";
import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import { hunkText, signs } from "./gitgutter";

const t = (s: string) => Text.of(s.split("\n"));
const of = (head: string, buf: string) => signs(Chunk.build(t(head), t(buf)), t(buf));

test("added, changed and deleted lines", () => {
  expect(of("a\nb\nc\n", "a\nb\nc\n")).toEqual([]);
  expect(of("a\nc\n", "a\nb\nc\n")).toEqual([{ line: 2, sign: "add" }]);
  expect(of("a\nb\nc\n", "a\nB\nc\n")).toEqual([{ line: 2, sign: "mod" }]);
  expect(of("a\nb\nc\n", "a\nX\nY\nc\n")).toEqual([{ line: 2, sign: "mod" }, { line: 3, sign: "mod" }]);
  expect(of("a\nb\nc\n", "a\nc\n")).toEqual([{ line: 1, sign: "del" }]);
  expect(of("a\nb\nc\n", "b\nc\n")).toEqual([{ line: 1, sign: "deltop" }]);
});

test("the last line, with and without a final newline", () => {
  expect(of("a\nb\n", "a\nb\nc\n")).toEqual([{ line: 3, sign: "add" }]);
  expect(of("a\nb", "a\nB")).toEqual([{ line: 2, sign: "mod" }]);
  expect(of("a\nb\nc\n", "a\nb\n")).toEqual([{ line: 2, sign: "del" }]);
  expect(of("a\nb\nc", "a\nb")).toEqual([{ line: 2, sign: "mod" }]); // "b" loses its newline, like git diff says
});

// The hunks must read the way `git diff -U0` writes them: that is what `git apply --unidiff-zero` takes.
const hunks = (a: string, b: string) => Chunk.build(t(a), t(b)).map((c) => hunkText(t(a), t(b), c));

test("a change, an insertion and a deletion as zero-context hunks", () => {
  expect(hunks("a\nb\nc\n", "a\nB\nc\n")).toEqual(["@@ -2 +2 @@\n-b\n+B\n"]);
  expect(hunks("a\nc\n", "a\nb\nc\n")).toEqual(["@@ -1,0 +2 @@\n+b\n"]); // after line 1
  expect(hunks("a\nb\nc\n", "a\nc\n")).toEqual(["@@ -2 +1,0 @@\n-b\n"]);
  expect(hunks("a\n", "x\ny\nz\n")).toEqual(["@@ -1 +1,3 @@\n-a\n+x\n+y\n+z\n"]);
  expect(hunks("b\n", "a\nb\n")).toEqual(["@@ -0,0 +1 @@\n+a\n"]); // at the top: after line 0
});

test("a last line without a newline gets git's marker", () => {
  expect(hunks("a\nb", "a\nB")).toEqual(["@@ -2 +2 @@\n-b\n\\ No newline at end of file\n+B\n\\ No newline at end of file\n"]);
});

test("two separate changes are two hunks", () => {
  expect(hunks("a\nb\nc\nd\ne\n", "A\nb\nc\nd\nE\n")).toEqual(["@@ -1 +1 @@\n-a\n+A\n", "@@ -5 +5 @@\n-e\n+E\n"]);
});
