import { go } from "@codemirror/lang-go";
import { EditorState } from "@codemirror/state";
import { expect, test } from "vitest";
import type { Command } from "../../core/commands";
import { TestResults } from "../../core/testResults";
import type { Ctx } from "./context";
import { testCommands } from "./tests";

const SRC = `package p

import "testing"

func TestA(t *testing.T) {
	t.Log("a")
}

func helper() {}
`;

// A workbench with one open file; the cursor sits on the first occurrence of `at`.
function setup(path: string, at: string, tests: Record<string, string> = {}) {
  const doc = SRC;
  const state = EditorState.create({ doc, extensions: [go()], selection: { anchor: doc.indexOf(at) } });
  const ran: { name: string; cmd: string }[] = [];
  const failed: string[] = [];
  let onText: ((text: string, done: boolean) => void) | undefined;
  const sinks: NonNullable<typeof onText>[] = []; // every run's callback, oldest first
  const c = {
    ed: { current: () => ({ path }), activeView: () => ({ state }) },
    task: (t: { name: string; cmd: string }, o?: { onText?: typeof onText }) => {
      ran.push(t);
      onText = o?.onText;
      sinks.push(onText!);
    },
    fail: (m: string) => failed.push(m),
  } as unknown as Ctx;
  const results = new TestResults();
  const cmds = new Map(testCommands(c, results, () => tests).map((x: Command) => [x.id, x]));
  return {
    ran,
    failed,
    results,
    sinks,
    run: (id: string) => cmds.get(id)!.run(),
    text: (t: string, done = false) => onText!(t, done),
  };
}

test("test.nearest runs the test under the cursor and stores what the terminal prints", () => {
  const w = setup("internal/p_test.go", 't.Log("a")');
  w.run("test.nearest");
  expect(w.ran).toEqual([{ name: "Test TestA", cmd: "go test -v -run '^TestA$' ./internal" }]);
  w.text("=== RUN   TestA\n--- PASS: TestA (0.00s)\n");
  expect(w.results.get("internal/p_test.go")?.byName.get("TestA")?.status).toBe("pass");
  w.text("--- FAIL: TestA (0.00s)\n", true);
  expect(w.results.get("internal/p_test.go")?.byName.get("TestA")?.status).toBe("fail");
});

test("test.file and test.all run without a test at the cursor", () => {
  const w = setup("p_test.go", "helper");
  w.run("test.file");
  w.run("test.all");
  expect(w.ran.map((t) => t.cmd)).toEqual(["go test -v -run '^(TestA)$' .", "go test -v ./..."]);
  expect(w.failed).toEqual([]);
});

test("test.nearest fails outside a test, and without a runner for the file", () => {
  const a = setup("p_test.go", "helper");
  a.run("test.nearest");
  expect(a.failed).toEqual(["No test at the cursor"]);
  const b = setup("notes.md", "helper");
  b.run("test.file");
  expect(b.failed).toEqual(["No test runner for this file type"]);
  expect([...a.ran, ...b.ran]).toEqual([]);
});

test("test.last repeats the same command, also before there was one", () => {
  const w = setup("p_test.go", 't.Log("a")');
  w.run("test.last");
  expect(w.failed).toEqual(["No test run yet: <Space>rn"]);
  w.run("test.nearest");
  w.run("test.last");
  expect(w.ran.map((t) => t.cmd)).toEqual(["go test -v -run '^TestA$' .", "go test -v -run '^TestA$' ."]);
});

test("a tests template of settings.json replaces the command; nearest needs its ${name}", () => {
  const w = setup("a/p_test.go", 't.Log("a")', { go: "gotestsum -- -run ${name} ./${dir}" });
  w.run("test.nearest");
  w.run("test.all");
  expect(w.ran.map((t) => t.cmd)).toEqual(["gotestsum -- -run 'TestA' ./'a'", "go test -v ./..."]);
  const v = setup("p_test.go", 't.Log("a")', { go: "gotestsum ./${dir}" });
  v.run("test.nearest");
  expect(v.failed).toEqual(["No ${name} in your tests.go command"]);
  v.run("test.file");
  expect(v.ran.map((t) => t.cmd)).toEqual(["gotestsum ./'.'"]);
});

test("a run keeps results that left the scrollback, and a newer run of the file silences the older one", () => {
  const w = setup("p_test.go", 't.Log("a")');
  w.run("test.nearest");
  w.text("--- FAIL: TestA (0.00s)\n");
  w.text("--- PASS: TestB (0.00s)\n"); // TestA scrolled out
  const r = w.results.get("p_test.go")!.byName;
  expect([r.get("TestA")?.status, r.get("TestB")?.status]).toEqual(["fail", "pass"]);
  w.text("--- FAIL: TestA (0.00s)\n", true);
  w.text("--- PASS: TestA (0.00s)\n"); // a replay of the same callback
  expect(w.results.get("p_test.go")!.byName.get("TestA")?.status).toBe("pass");
  w.run("test.nearest");
  w.sinks[0]("--- PASS: TestC (0.00s)\n", false);
  expect(w.results.get("p_test.go")!.byName.has("TestC")).toBe(false);
});
