import { expect, test } from "vitest";
import { parseProblems, parseWatcherProblems } from "./tasks";

const loc = (path: string, line: number, col: number, text: string) => ({ path, line, col, len: 0, text });

test("go build, vet and test lines", () => {
  const out = [
    "# example.com/e2e",
    "./broken.go:5:2: undefined: missing",
    "vet: ./broken.go:9:14: fmt.Printf format %d has arg s of wrong type string",
    "--- FAIL: TestX (0.00s)",
    "    x_test.go:12: got 1, want 2",
    "FAIL",
  ].join("\n");
  expect(parseProblems(out, "/ws")).toEqual([
    loc("broken.go", 5, 1, "undefined: missing"),
    loc("broken.go", 9, 13, "fmt.Printf format %d has arg s of wrong type string"),
    loc("x_test.go", 12, 0, "got 1, want 2"),
  ]);
});

test("gcc/clang with absolute paths inside the folder, and tsc in both styles", () => {
  const out = [
    "/ws/src/a.c:3:5: error: use of undeclared identifier 'y'",
    "/usr/include/stdio.h:10:1: note: elsewhere",
    "src/b.ts(7,3): error TS2322: Type 'string' is not assignable to type 'number'.",
    "src/c.ts:4:10 - error TS2304: Cannot find name 'z'.",
  ].join("\r\n");
  expect(parseProblems(out, "/ws")).toEqual([
    loc("src/a.c", 3, 4, "error: use of undeclared identifier 'y'"),
    loc("/usr/include/stdio.h", 10, 0, "note: elsewhere"),
    loc("src/b.ts", 7, 2, "error TS2322: Type 'string' is not assignable to type 'number'."),
    loc("src/c.ts", 4, 9, "error TS2304: Cannot find name 'z'."),
  ]);
});

test("lines that only look like locations stay out", () => {
  const out = ["listening on http://localhost:8080/", "12:30:01 started", "ok  \texample.com/e2e\t0.2s", "[process exited]"].join("\n");
  expect(parseProblems(out, "/ws")).toEqual([]);
});

test("Windows paths with drive letters and backslashes", () => {
  const out = [
    `C:\\workspace\\src\\main.go:14:5: undefined: helper`,
    `C:\\workspace\\sub\\lib.ts(20,2): error TS2322: Type error`,
    `.\\relative\\path.go:8:1: syntax error`,
    `D:\\other\\file.c:1:1: error`,
  ].join("\r\n");
  expect(parseProblems(out, "C:\\workspace")).toEqual([
    loc("src/main.go", 14, 4, "undefined: helper"),
    loc("sub/lib.ts", 20, 1, "error TS2322: Type error"),
    loc("relative/path.go", 8, 0, "syntax error"),
    loc("D:/other/file.c", 1, 0, "error"),
  ]);
});

test("parseWatcherProblems: typst watch cycle extracts only current cycle and clears on success", () => {
  const failedThenSuccess = [
    "[10:00:00] compiling ...",
    "watching main.typ",
    "[10:00:00] compiled with errors",
    "main.typ:5:10: error: expected expression",
    "[10:00:05] compiling ...",
    "watching main.typ",
    "[10:00:05] compiled successfully in 10 ms",
  ].join("\n");
  expect(parseWatcherProblems(failedThenSuccess, "/ws")).toEqual([]);

  const failedCycle = [
    "[10:00:00] compiling ...",
    "[10:00:00] compiled successfully in 10 ms",
    "[10:00:05] compiling ...",
    "watching main.typ",
    "[10:00:05] compiled with errors",
    "sub/chapter.typ:12:4: error: unknown import",
  ].join("\n");
  expect(parseWatcherProblems(failedCycle, "/ws")).toEqual([
    loc("sub/chapter.typ", 12, 3, "error: unknown import"),
  ]);
});

test("parseWatcherProblems: LaTeX watcher loop with delimiters", () => {
  const failed = [
    "--- compiling ---",
    "error: ./paper.tex:24: Undefined control sequence \\badcmd",
  ].join("\n");
  expect(parseWatcherProblems(failed, "/ws")).toEqual([
    loc("paper.tex", 24, 0, "Undefined control sequence \\badcmd"),
  ]);

  const success = [
    "--- compiling ---",
    "error: ./paper.tex:24: Undefined control sequence \\badcmd",
    "--- compiling ---",
    "--- success ---",
  ].join("\n");
  expect(parseWatcherProblems(success, "/ws")).toEqual([]);
});
