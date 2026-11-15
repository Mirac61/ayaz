import { expect, test } from "vitest";
import { docBuild } from "./docBuild";
import { parseProblems } from "./tasks";

test("typst watches and writes the PDF beside the source", () => {
  const b = docBuild("notes/thesis.typ")!;
  expect(b.pdf).toBe("notes/thesis.pdf");
  expect(b.cmd).toBe("typst watch --diagnostic-format short 'notes/thesis.typ' 'notes/thesis.pdf'");
});

test("tex builds with tectonic when the file changes; quotes in the name stay inside the string", () => {
  const b = docBuild("it's.tex")!;
  expect(b.pdf).toBe("it's.pdf");
  expect(b.cmd.startsWith("sh -c ")).toBe(true);
  expect(b.cmd).toContain("tectonic -X compile");
  expect(b.cmd).toContain(`'\\''`);
});

test("other files have no build", () => {
  expect(docBuild("a.md")).toBeNull();
  expect(docBuild("Makefile")).toBeNull();
});

test("the compilers' error lines are problems for the quickfix list", () => {
  const out = "main.typ:3:5: error: unknown variable: x\nerror: main.tex:12: Undefined control sequence\n./c.tex:7: Missing $ inserted.";
  expect(parseProblems(out, "/ws").map((l) => [l.path, l.line])).toEqual([["main.typ", 3], ["main.tex", 12], ["c.tex", 7]]);
});
