import { expect, test } from "vitest";
import { adapterFor, goAdapter } from "./tests";

const at = (file: string, name?: string) => ({ file, dir: file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ".", name });

test("go commands for the three scopes", () => {
  expect(goAdapter.command("file", at("a_test.go"))).toBe("go test -v .");
  expect(goAdapter.command("file", at("internal/git/a_test.go"))).toBe("go test -v ./internal/git");
  expect(goAdapter.command("all", at("internal/git/a_test.go"))).toBe("go test -v ./...");
  expect(goAdapter.command("nearest", at("a_test.go", "TestX"))).toBe("go test -v -run '^TestX$' .");
  expect(goAdapter.command("nearest", at("internal/git/a_test.go", "TestX"))).toBe(
    "go test -v -run '^TestX$' ./internal/git",
  );
  expect(() => goAdapter.command("nearest", at("a_test.go"))).toThrow();
});

test("go commands quote a folder with a space or a quote", () => {
  expect(goAdapter.command("file", at("my dir/a_test.go"))).toBe("go test -v './my dir'");
  expect(goAdapter.command("file", at("it's/a_test.go"))).toBe("go test -v './it'\\''s'");
});

test("a test name cannot start a second shell command", () => {
  const cmd = goAdapter.command("nearest", at("a_test.go", "Test $(rm -rf ~); echo 'x"));
  expect(cmd).toBe("go test -v -run '^Test $(rm -rf ~); echo '\\''x$' .");
});

// Real output of `go test -v` for a module with a passing, a failing and a skipped test and one test with subtests.
const GO_OUT = `=== RUN   TestOk
--- PASS: TestOk (0.00s)
=== RUN   TestBad
    a_test.go:6: no
--- FAIL: TestBad (0.00s)
=== RUN   TestSkipped
    a_test.go:7: later
--- SKIP: TestSkipped (0.00s)
=== RUN   TestSub
=== RUN   TestSub/good
=== RUN   TestSub/bad
    a_test.go:10: x
--- FAIL: TestSub (0.00s)
    --- PASS: TestSub/good (0.00s)
    --- FAIL: TestSub/bad (0.00s)
FAIL
FAIL	fix	0.187s
FAIL
`;

test("go parse: pass, fail, skip and subtests", () => {
  expect(goAdapter.parse(GO_OUT)).toEqual([
    { name: "TestOk", status: "pass", ms: 0 },
    { name: "TestBad", status: "fail", ms: 0 },
    { name: "TestSkipped", status: "skip", ms: 0 },
    { name: "TestSub", status: "fail", ms: 0 },
    { name: "TestSub/good", status: "pass", ms: 0 },
    { name: "TestSub/bad", status: "fail", ms: 0 },
  ]);
});

test("go parse: durations in ms, ANSI colours and CRLF", () => {
  const out = "\x1b[32m--- PASS: TestSlow (1.25s)\x1b[0m\r\n\x1b[31m--- FAIL: TestB (0.01s)\x1b[0m\r\n";
  expect(goAdapter.parse(out)).toEqual([
    { name: "TestSlow", status: "pass", ms: 1250 },
    { name: "TestB", status: "fail", ms: 10 },
  ]);
});

test("go parse: empty output and unrelated lines give nothing", () => {
  expect(goAdapter.parse("")).toEqual([]);
  expect(goAdapter.parse("ok  \tfix\t0.1s\nPASS\n")).toEqual([]);
});

test("adapterFor picks by extension", () => {
  expect(adapterFor("internal/git/git_test.go")).toBe(goAdapter);
  expect(adapterFor("README.md")).toBeNull();
  expect(adapterFor("Makefile")).toBeNull();
});
