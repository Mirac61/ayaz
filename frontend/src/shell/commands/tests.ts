// Test commands: the test at the cursor, the file or everything runs in a terminal split; what it reports goes to TestResults.
import type { Command } from "../../core/commands";
import { settings } from "../../core/settings";
import { testResults, type TestResults } from "../../core/testResults";
import { adapterFor, testCommand, type Scope, type TestAt, type TestResult } from "../../core/tests";
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
    const declared = testsIn(view.state, path).map((t) => t.name);
    const names = scope === "file" ? declared : undefined;
    if (scope === "nearest") {
      name = testAt(view.state, path, view.state.selection.main.head)?.name;
      if (!name) {
        return c.fail("No test at the cursor");
      }
    }
    const template = templates()[adapter.id];
    const launch = (found: Partial<TestAt>) => {
      let cmd: string;
      try {
        cmd = testCommand(adapter, scope, { file: path, name, names, ...found }, template);
      } catch (e) {
        return c.fail((e as Error).message);
      }
      const label = scope === "nearest" ? `Test ${name}` : scope === "file" ? `Test ${path}` : "Test all";
      const run = () => {
        const id = ++runs;
        owner.set(path, id);
        // shortcut: keeps what scrolled out between callbacks, but the terminal's live callback is debounced, so output that
        // streams past its 10_000 lines without a pause loses its start; upgrade: throttle onLiveOutput in terminal.ts
        const seen = new Map<string, TestResult>();
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
              // shortcut: everything ran, so keep only the tests this file declares; a same-named test elsewhere still lands here
              const own = scope === "all" ? [...seen.values()].filter((r) => declared.includes(r.name)) : [...seen.values()];
              results.set(path, own, Date.now());
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
    // A user template needs no detection; without one the project says which runner it has.
    if (adapter.detect && template === undefined) {
      void adapter.detect(path, c.files).then(launch);
    } else {
      launch({});
    }
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
