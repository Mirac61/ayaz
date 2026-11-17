import { expect, test } from "vitest";
import { adapterFor, goAdapter, jsAdapter, testCommand } from "./tests";

const at = (file: string, name?: string) => ({ file, name });

test("go commands for the three scopes", () => {
  expect(goAdapter.command("file", at("a_test.go"))).toBe("go test -v .");
  expect(goAdapter.command("file", at("internal/git/a_test.go"))).toBe("go test -v ./internal/git");
  expect(goAdapter.command("all", at("internal/git/a_test.go"))).toBe("go test -v ./...");
  expect(goAdapter.command("nearest", at("a_test.go", "TestX"))).toBe("go test -v -run '^TestX$' .");
  expect(goAdapter.command("nearest", at("internal/git/a_test.go", "TestX"))).toBe("go test -v -run '^TestX$' ./internal/git");
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
    { name: "TestOk", pkg: "fix", status: "pass", ms: 0 },
    { name: "TestBad", pkg: "fix", status: "fail", ms: 0 },
    { name: "TestSkipped", pkg: "fix", status: "skip", ms: 0 },
    { name: "TestSub", pkg: "fix", status: "fail", ms: 0 },
    { name: "TestSub/good", pkg: "fix", status: "pass", ms: 0 },
    { name: "TestSub/bad", pkg: "fix", status: "fail", ms: 0 },
  ]);
});

test("go parse: the same test name in two packages stays apart", () => {
  const out = "--- PASS: TestNew (0.00s)\nPASS\nok  \texample/a\t0.1s\n--- FAIL: TestNew (0.00s)\nFAIL\nFAIL\texample/b\t0.2s\n";
  expect(goAdapter.parse(out)).toEqual([
    { name: "TestNew", pkg: "example/a", status: "pass", ms: 0 },
    { name: "TestNew", pkg: "example/b", status: "fail", ms: 0 },
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

test("testCommand: the adapter's own command without a template", () => {
  expect(testCommand(goAdapter, "file", { file: "a/b_test.go" })).toBe("go test -v ./a");
});

test("testCommand: a template fills file, dir and name, all quoted", () => {
  const at = { file: "a b/x_test.go", name: "TestA; rm -rf ~" };
  expect(testCommand(goAdapter, "nearest", at, "t ${file} ${dir} ${name}")).toBe("t 'a b/x_test.go' 'a b' 'TestA; rm -rf ~'");
  expect(testCommand(goAdapter, "file", at, "t ${file}")).toBe("t 'a b/x_test.go'");
});

test("testCommand: nearest without ${name} throws, other scopes keep a literal ${name}", () => {
  expect(() => testCommand(goAdapter, "nearest", { file: "x_test.go", name: "TestA" }, "t ${file}")).toThrow(
    "No ${name} in your tests.go command",
  );
  expect(testCommand(goAdapter, "all", { file: "x_test.go" }, "t ${name}")).toBe("t ${name}");
});

test("adapterFor picks by extension", () => {
  expect(adapterFor("internal/git/git_test.go")).toBe(goAdapter);
  expect(adapterFor("README.md")).toBeNull();
  expect(adapterFor("Makefile")).toBeNull();
  expect(adapterFor("src/a.test.ts")).toBe(jsAdapter);
  expect(adapterFor("a.mjs")).toBe(jsAdapter);
});

const files = (tree: Record<string, string[]>, pkgs: Record<string, string> = {}) => ({
  list: async (dir: string) => {
    if (!(dir in tree)) {
      throw new Error("no such folder");
    }
    return tree[dir].map((name) => ({ name, dir: name.endsWith("/") })) as never;
  },
  readText: async (path: string) => ({ path, content: pkgs[path] ?? "", mtime: 1 }),
});

test("js detect: vitest from the nearest package.json, run from its folder", async () => {
  const f = files(
    { "": ["go.mod", "frontend/"], frontend: ["package.json", "bun.lock", "src/"], "frontend/src": ["a.test.ts"] },
    { "frontend/package.json": '{"devDependencies":{"vitest":"^5"}}' },
  );
  const found = await jsAdapter.detect!("frontend/src/a.test.ts", f);
  expect(found).toEqual({ runner: "vitest", pm: "bunx", pkgDir: "frontend" });
  expect(jsAdapter.command("nearest", { file: "frontend/src/a.test.ts", name: "adds (1)", ...found })).toBe(
    "cd frontend && bunx vitest run --reporter=verbose -t 'adds \\(1\\)' src/a.test.ts",
  );
  expect(jsAdapter.command("file", { file: "frontend/src/a.test.ts", ...found })).toBe(
    "cd frontend && bunx vitest run --reporter=verbose src/a.test.ts",
  );
  expect(jsAdapter.command("all", { file: "frontend/src/a.test.ts", ...found })).toBe(
    "cd frontend && bunx vitest run --reporter=verbose",
  );
});

test("js detect: jest, pnpm and npx by the lock file; jest named in a script counts", async () => {
  const pnpm = files({ "": ["package.json", "pnpm-lock.yaml"] }, { "package.json": '{"scripts":{"test":"jest --ci"}}' });
  expect(await jsAdapter.detect!("a.test.js", pnpm)).toEqual({ runner: "jest", pm: "pnpm exec", pkgDir: "" });
  const npm = files({ "": ["package.json"] }, { "package.json": '{"dependencies":{"jest":"1"}}' });
  expect(await jsAdapter.detect!("a.test.js", npm)).toEqual({ runner: "jest", pm: "npx", pkgDir: "" });
});

test("js detect: bun without vitest or jest, node otherwise, nothing without a package.json", async () => {
  const bun = files({ "": ["package.json", "bunfig.toml"] }, { "package.json": "{}" });
  expect((await jsAdapter.detect!("a.test.ts", bun)).runner).toBe("bun");
  const node = files({ "": ["package.json"] }, { "package.json": "not json" });
  expect((await jsAdapter.detect!("a.test.ts", node)).runner).toBe("node");
  expect(await jsAdapter.detect!("a/b.test.ts", files({ "": ["a/"], a: ["b.test.ts"] }))).toEqual({});
});

test("js commands: jest, bun and node, with and without a package folder", () => {
  expect(jsAdapter.command("file", { file: "a.test.js", runner: "jest", pm: "npx", pkgDir: "" })).toBe(
    "npx jest --verbose a.test.js",
  );
  expect(jsAdapter.command("nearest", { file: "p/a.test.ts", name: "x", runner: "bun", pkgDir: "p" })).toBe(
    "cd p && bun test -t 'x' ./a.test.ts",
  );
  expect(jsAdapter.command("nearest", { file: "a.test.mjs", name: "it's", runner: "node" })).toBe(
    "node --test --test-name-pattern 'it'\\''s' a.test.mjs",
  );
  expect(jsAdapter.command("all", { file: "a.test.mjs" })).toBe("node --test");
  expect(() => jsAdapter.command("nearest", { file: "a.test.ts" })).toThrow();
});

test("js commands: a test name cannot start a second shell command", () => {
  const cmd = jsAdapter.command("nearest", { file: "a.test.ts", name: "x'; rm -rf ~; echo '", runner: "jest", pm: "npx" });
  expect(cmd).toBe("npx jest --verbose -t 'x'\\''; rm -rf ~; echo '\\''' a.test.ts");
});

// Real output of `vitest run --reporter=verbose` (v5, project "node") for a passing, a failing and a skipped test.
const VITEST_OUT = `
 RUN  v5.1.0 /work/frontend

 ✓ |node| src/fxv.test.ts > adds 1ms
 × |node| src/fxv.test.ts > group > fails here 2ms
   → expected 1 to be 2 // Object.is equality
 ↓ |node| src/fxv.test.ts > group > is skipped
 ✓ |node| src/fxv.test.ts > group > nested ok 0ms

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 1 skipped (4)
`;

test("js parse: vitest verbose output, describe paths are dropped", () => {
  expect(jsAdapter.parse(VITEST_OUT)).toEqual([
    { name: "adds", status: "pass", ms: 1 },
    { name: "fails here", status: "fail", ms: 2 },
    { name: "is skipped", status: "skip" },
    { name: "nested ok", status: "pass", ms: 0 },
  ]);
});

// NOT run here (bun test is not allowed in this sandbox): the format from the bun docs.
const BUN_OUT = `bun test v1.2.0

src/a.test.ts:
(pass) adds [0.50ms]
(fail) group > fails here [1.20ms]
(skip) group > is skipped
(todo) later
`;

test("js parse: bun test output", () => {
  expect(jsAdapter.parse(BUN_OUT)).toEqual([
    { name: "adds", status: "pass", ms: 1 },
    { name: "fails here", status: "fail", ms: 1 },
    { name: "is skipped", status: "skip" },
    { name: "later", status: "skip" },
  ]);
});

// NOT run here (jest is not installed): the format from the jest docs for `--verbose`.
const JEST_OUT = `PASS src/a.test.js
  group
    ✓ adds (2 ms)
    ✕ fails here (13 ms)
    ○ skipped is skipped
`;

test("js parse: jest verbose output, ANSI colours first", () => {
  expect(jsAdapter.parse(JEST_OUT)).toEqual([
    { name: "adds", status: "pass", ms: 2 },
    { name: "fails here", status: "fail", ms: 13 },
    { name: "is skipped", status: "skip" },
  ]);
  expect(jsAdapter.parse("\x1b[32m    ✓\x1b[0m \x1b[90madds (2 ms)\x1b[0m\r\n")).toEqual([
    { name: "adds", status: "pass", ms: 2 },
  ]);
});

test("js parse: noise gives nothing", () => {
  expect(jsAdapter.parse("")).toEqual([]);
  expect(jsAdapter.parse("Tests  1 failed\n → expected 1\n")).toEqual([]);
});
