// Test commands: the test at the cursor, the file or everything runs in a terminal split; what it reports goes to TestResults.
import type { Command } from "../../core/commands";
import { settings } from "../../core/settings";
import { testResults, type TestResults } from "../../core/testResults";
import { adapterFor, testCommand, type Scope, type TestResult } from "../../core/tests";
import { testAt, testsIn } from "../../editor/tests";
import type { Ctx } from "./context";

const SCOPES: [Scope, string][] = [
  ["nearest", "the test at the cursor"],
  ["file", "the tests of this file"],
  ["all", "all tests"],
];

export function testCommands(c: Ctx, results: TestResults = testResults, templates = () => settings().tests): Command[] {
  // The built command, not the scope: <Space>rt repeats the same test from any file.
  let last: (() => void) | null = null;
  let runs = 0;
  const owner = new Map<string, number>(); // the run whose output a path's results show

  const start = (scope: Scope) => {
    const path = c.ed.current()?.path;
    const view = c.ed.activeView();
    if (!path || !view || path.startsWith("/") || path.includes("://")) {
      return c.fail("No test runner for this file type");
    }
    const adapter = adapterFor(path);
    if (!adapter) {
      return c.fail("No test runner for this file type");
    }
    let name: string | undefined;
    const names = scope === "file" ? testsIn(view.state, path).map((t) => t.name) : undefined;
    if (names && !names.length) {
      return c.fail("No tests in this file");
    }
    if (scope === "nearest") {
      name = testAt(view.state, path, view.state.selection.main.head)?.name;
      if (!name) {
        return c.fail("No test at the cursor");
      }
    }
    let cmd: string;
    try {
      cmd = testCommand(adapter, scope, { file: path, name, names }, templates()[adapter.id]);
    } catch (e) {
      return c.fail((e as Error).message);
    }
    const label = scope === "nearest" ? `Test ${name}` : scope === "file" ? `Test ${path}` : "Test all";
    const run = () => {
      const id = ++runs;
      owner.set(path, id);
      const seen = new Map<string, TestResult>(); // the terminal's scrollback is capped: keep what scrolled out
      c.task(
        { name: label, cmd },
        {
          onText: (text, done) => {
            if (owner.get(path) !== id) {
              return; // a newer run of this file took over
            }
            for (const r of adapter.parse(text)) {
              if (r.status === "fail" || seen.get(r.name)?.status !== "fail") {
                seen.set(r.name, r);
              }
            }
            results.set(path, [...seen.values()], Date.now());
            if (done) {
              seen.clear(); // <Space>rl replays this callback: the next run starts empty
            }
          },
        },
      );
    };
    last = run;
    run();
  };

  return [
    ...SCOPES.map(([scope, what]): Command => ({ id: `test.${scope}`, title: `Test: run ${what}`, run: () => start(scope) })),
    {
      id: "test.last",
      title: "Test: run the last test again",
      run: () => (last ? last() : c.fail("No test run yet: <Space>rn")),
    },
  ];
}
