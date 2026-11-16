import { afterEach, expect, test, vi } from "vitest";
import type { Files } from "../../core/backend";
import type { Ctx } from "./context";
import { fileCommands } from "./file";

afterEach(() => vi.unstubAllGlobals());

// A Ctx with a tree on `selected`; prompt answers with `answer` at once.
function setup(selected: { path: string; dir: boolean }, answer: string, dirty: string[] = []) {
  vi.stubGlobal("document", { activeElement: { closest: () => ({}) } }); // the tree has the focus
  const log: string[] = [];
  const c = {
    files: { duplicate: async (a: string, b: string) => void log.push(`duplicate ${a} -> ${b}`) } as unknown as Files,
    ed: { buffers: { dirty: () => dirty.map((path) => ({ path })) } },
    tree: { current: { selected: () => selected, reveal: async (p: string) => void log.push(`reveal ${p}`) } },
    say: (t: string) => void log.push(`say ${t}`),
    fail: (t: string) => void log.push(`fail ${t}`),
    prompt: (_t: string, _i: string, act: (s: string) => Promise<unknown>) => void act(answer),
  } as unknown as Ctx;
  const run = async () => {
    fileCommands(c).find((x) => x.id === "file.duplicate")!.run();
    await new Promise((r) => setTimeout(r, 0));
    return log;
  };
  return run;
}

test("file.duplicate copies after the prompt and selects the copy", async () => {
  expect(await setup({ path: "src/a.go", dir: false }, "src/b.go")()).toEqual([
    "duplicate src/a.go -> src/b.go",
    "reveal src/b.go",
    'say Duplicated to "src/b.go"',
  ]);
});

test("file.duplicate with the same name does nothing", async () => {
  expect(await setup({ path: "a.go", dir: false }, "a.go")()).toEqual([]);
});

test("file.duplicate refuses folders and files with unsaved changes", async () => {
  expect(await setup({ path: "src", dir: true }, "x")()).toEqual(["fail Only files can be duplicated"]);
  expect(await setup({ path: "a.go", dir: false }, "b.go", ["a.go"])()).toEqual([
    'fail "a.go" has unsaved changes: save first (:w)',
  ]);
});
