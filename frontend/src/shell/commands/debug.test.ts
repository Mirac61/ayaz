import { go } from "@codemirror/lang-go";
import { EditorState } from "@codemirror/state";
import { expect, test } from "vitest";
import type { Ctx } from "./context";
import { debugCommands } from "./debug";

const SRC = `package p

import "testing"

func TestA(t *testing.T) {
	t.Log("a")
}

func helper() {}
`;

// A workbench with one open file; the cursor sits on the first occurrence of `at`.
function setup(path: string, at: string) {
  const state = EditorState.create({ doc: SRC, extensions: [go()], selection: { anchor: SRC.indexOf(at) } });
  const started: unknown[] = [];
  const failed: string[] = [];
  const c = {
    ed: { activePath: () => path, activeView: () => ({ state }) },
    dbg: { start: async (o: unknown) => void started.push(o) },
    fail: (m: string) => failed.push(m),
  } as unknown as Ctx;
  const run = () =>
    debugCommands(c)
      .find((x) => x.id === "debug.test")!
      .run();
  return { started, failed, run };
}

test("debug.test starts the test under the cursor", async () => {
  const w = setup("p_test.go", 't.Log("a")');
  await w.run();
  expect(w.started).toEqual([{ test: "TestA" }]);
  expect(w.failed).toEqual([]);
});

test("debug.test fails outside a test and in a file that isn't Go, and starts nothing", async () => {
  const a = setup("p_test.go", "helper");
  await a.run();
  expect(a.failed).toEqual(["No test at the cursor"]);
  const b = setup("p.test.ts", 't.Log("a")');
  await b.run();
  expect(b.failed).toEqual(["Debugging a test works for Go files only"]);
  expect(a.started.concat(b.started)).toEqual([]);
});
