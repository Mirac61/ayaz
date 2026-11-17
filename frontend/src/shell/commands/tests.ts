// Test commands: the test at the cursor, the file or everything runs in a terminal split; what it reports goes to TestResults.
import type { Command } from "../../core/commands";
import { settings } from "../../core/settings";
import { testResults, type TestResults } from "../../core/testResults";
import { adapterFor, testCommand, type Scope, type TestAt } from "../../core/tests";
import { testAt } from "../../editor/tests";
import type { Ctx } from "./context";

const SCOPES: [Scope, string][] = [
  ["nearest", "the test at the cursor"],
  ["file", "the tests of this file"],
  ["all", "all tests"],
];

export function testCommands(c: Ctx, results: TestResults = testResults, templates = () => settings().tests): Command[] {
  // The built command, not the scope: <Space>rt repeats the same test from any file.
  let last: (() => void) | null = null;

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
        cmd = testCommand(adapter, scope, { file: path, name, ...found }, template);
      } catch (e) {
        return c.fail((e as Error).message);
      }
      const label = scope === "nearest" ? `Test ${name}` : scope === "file" ? `Test ${path}` : "Test all";
      const run = () =>
        c.task(
          { name: label, cmd },
          { onText: (text) => results.set(path, adapter.parse(text), Date.now()) }, // the terminal hands over all of its text each time
        );
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
