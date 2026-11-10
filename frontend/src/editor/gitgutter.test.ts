import { expect, test } from "vitest";
import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import { signs } from "./gitgutter";

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
