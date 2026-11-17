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
// `current` is the open buffer's own path (absolute outside the folder); `dirty` the unsaved buffers' paths.
function setup(path: string | null, at: string, { current = path, dirty = [] as string[] } = {}) {
  const state = EditorState.create({ doc: SRC, extensions: [go()], selection: { anchor: SRC.indexOf(at) } });
  const started: unknown[] = [];
  const failed: string[] = [];
  const c = {
    ed: {
      activePath: () => path,
      activeView: () => ({ state }),
      current: () => (current === null ? null : { path: current }),
      buffers: { dirty: () => dirty.map((p) => ({ path: p })) },
    },
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

test("debug.test: a Go file that isn't a test file has no test at the cursor", async () => {
  const w = setup("p.go", 't.Log("a")');
  await w.run();
  expect(w.failed).toEqual(["No test at the cursor"]);
  expect(w.started).toEqual([]);
});

test("debug.test: no workspace file (outside the folder or a head:// view, activePath is null) starts nothing", async () => {
  const w = setup(null, 't.Log("a")');
  await w.run();
  expect(w.failed).toEqual(["Debugging a test works for Go files only"]);
  expect(w.started).toEqual([]);
});

test("debug.test: a Go file outside the folder says so instead of 'Go files only'", async () => {
  const w = setup(null, 't.Log("a")', { current: "/usr/lib/go/src/fmt/p_test.go" });
  await w.run();
  expect(w.failed).toEqual(["Debugging a test works for files in the workspace only"]);
  expect(w.started).toEqual([]);
});

test("debug.test: unsaved Go files of the test's package stop it; other packages and non-Go files don't", async () => {
  const a = setup("pkg/p_test.go", 't.Log("a")', { dirty: ["pkg/p.go"] });
  await a.run();
  expect(a.failed).toEqual(["Unsaved changes in this package: :wa saves them"]);
  expect(a.started).toEqual([]);
  const b = setup("pkg/p_test.go", 't.Log("a")', { dirty: ["pkg/sub/q.go", "other/p.go", "pkg/README.md"] });
  await b.run();
  expect(b.failed).toEqual([]);
  expect(b.started).toEqual([{ test: "TestA" }]);
});
