import { expect, test } from "vitest";
import { expandTask, parseProblems, parseWatcherProblems } from "./tasks";

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

test("expandTask fills file, dir and line", () => {
  const at = { file: "src/app.go", line: 42 };
  expect(expandTask("vet ${file}", at)).toBe("vet 'src/app.go'");
  expect(expandTask("go test ./${dir}", at)).toBe("go test ./'src'");
  expect(expandTask("echo ${line}", at)).toBe("echo 42");
  expect(expandTask("${file}:${line} in ${dir}", at)).toBe("'src/app.go':42 in 'src'");
});

test("expandTask quotes paths for the shell", () => {
  expect(expandTask("cat ${file}", { file: "a b/it's; rm.txt" })).toBe("cat 'a b/it'\\''s; rm.txt'");
});

test("expandTask escapes for the quotes around the placeholder", () => {
  const at = { file: "$(id) it's.txt", line: 3 };
  expect(expandTask('cat "${file}"', at)).toBe('cat "\\$(id) it\'s.txt"');
  expect(expandTask("cat '${file}'", at)).toBe("cat '$(id) it'\\''s.txt'");
  expect(expandTask(`echo "a \\" '\${dir}'" \${line}`, at)).toBe(`echo "a \\" '.'" 3`);
  expect(expandTask('cat "${file}" ${file}', { file: 'a"b' })).toBe(`cat "a\\"b" 'a"b'`);
});

test("expandTask refuses placeholders where it can't tell the quoting", () => {
  const at = { file: "a.go", line: 2 };
  for (const cmd of [
    `printf '%s\\n' "$(printf '%s' "\${file}")"`,
    "echo `cat ${file}`",
    "echo $(ls) ${dir}",
    "cat <<EOF\n${file}\nEOF",
    "echo $'it\\'s' ${file}",
    'echo "${x:-"${file}"}"',
    "true # it's\necho ${file}",
    "echo '${file}",
  ]) {
    expect(() => expandTask(cmd, at), cmd).toThrow();
  }
  // ${line} is a number, safe anywhere; plain ${NAME}, a quoted #, $( or << in single quotes don't count
  expect(expandTask("echo $(seq ${line})", at)).toBe("echo $(seq 2)");
  expect(expandTask(`echo "\${HOME}#" '$(<<' \${file}`, at)).toBe(`echo "\${HOME}#" '$(<<' 'a.go'`);
});

// The shell, not string equality, decides whether a hostile name stays literal. No /bin/sh (Windows) skips it.
// Node modules load through a string so tsc, which has no Node types here, sees them as any.
const node = (m: string) => import(m);
const { execFileSync } = await node("node:child_process");
const { existsSync, mkdtempSync, readdirSync } = await node("node:fs");
const shells = ["/bin/sh", "/bin/bash", "/bin/zsh"].filter((s) => existsSync(s));
test.skipIf(!shells.length)("expanded tasks pass hostile names through literally", () => {
  const file = "$(touch PWNED) `touch PWNED` \"q\" it's\\n.txt";
  for (const sh of shells) {
    for (const tpl of ["printf %s ${file}", "printf %s \"${file}\"", "printf %s '${file}'", `printf %s "x"'\${file}'`]) {
      const dir = mkdtempSync("/tmp/ayaz-task-");
      const got = execFileSync(sh, ["-c", expandTask(tpl, { file })!], { cwd: dir, encoding: "utf8" });
      expect(got, `${sh}: ${tpl}`).toBe(tpl.includes('"x"') ? "x" + file : file);
      expect(readdirSync(dir), `${sh}: ${tpl}`).toEqual([]);
    }
  }
});

test("expandTask: dir of a root file is '.', other ${} stays, no placeholder needs no file", () => {
  expect(expandTask("ls ${dir}", { file: "main.go" })).toBe("ls '.'");
  expect(expandTask("echo ${HOME} ${file}", { file: "a.go" })).toBe("echo ${HOME} 'a.go'");
  expect(expandTask("go test ./...", {})).toBe("go test ./...");
  expect(expandTask("echo ${file}", {})).toBeNull();
  expect(expandTask("echo ${line}", {})).toBeNull();
});
