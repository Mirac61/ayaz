import { EditorState, type Text } from "@codemirror/state";
import { afterEach, expect, test, vi } from "vitest";
import type { Buffer } from "../../core/buffers";
import type { Files } from "../../core/backend";
import type { PickerSource } from "../Picker";
import type { Ctx } from "./context";
import { fileCommands } from "./file";

afterEach(() => vi.unstubAllGlobals());

// A Ctx with just what file.history touches: one open buffer, two saves in the history.
async function history(old: string, current = "new text\n", editFails = false) {
  const log: string[] = [];
  const doc = EditorState.create({ doc: current }).doc;
  const b = { path: "a.txt", state: { doc } } as unknown as Buffer;
  let picker: PickerSource | null = null;
  const c = {
    files: {
      history: async () => [{ time: 1000, size: old.length }],
      historyText: async () => old,
    } as unknown as Files,
    ed: {
      current: () => b,
      edit: async (_p: string, ch: { from: number; to: number; insert: string }[]) => {
        if (editFails) {
          throw new Error("boom");
        }
        const next = ch.reduce((t, x) => t.slice(0, x.from) + x.insert + t.slice(x.to), current);
        log.push(`edit -> ${JSON.stringify(next)}`);
      },
      diffWith: (t: Text) => void log.push(`diffWith ${JSON.stringify(t.toString())}`),
    },
    say: (t: string) => void log.push(`say ${t}`),
    fail: (t: string) => void log.push(`fail ${t}`),
    setPicker: (p: PickerSource | null) => void (picker = p),
  } as unknown as Ctx;
  await fileCommands(c)
    .find((x) => x.id === "file.history")!
    .run();
  const pick = async (side: boolean) => {
    picker!.pick({ label: "x" }, 0, side);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { log, pick, picker: () => picker! };
}

test("Cmd/Ctrl+Enter restores the old text as an edit; Enter still only diffs", async () => {
  const h = await history("old text\n");
  expect(h.picker().footer).toContain("Cmd/Ctrl+Enter restore");
  await h.pick(true);
  expect(h.log[0]).toBe('edit -> "old text\\n"');
  expect(h.log.some((l) => l.startsWith("diffWith"))).toBe(false);
  expect(h.log[1]).toMatch(/^say Restored the save before .*: unsaved, u undoes it$/);

  const d = await history("old text\n");
  await d.pick(false);
  expect(d.log[0]).toBe('diffWith "old text\\n"');
  expect(d.log.some((l) => l.startsWith("edit"))).toBe(false);
});

test("a save with CRLF is restored with LF", async () => {
  const h = await history("one\r\ntwo\r\n");
  await h.pick(true);
  expect(h.log[0]).toBe('edit -> "one\\ntwo\\n"');
});

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
    fileCommands(c)
      .find((x) => x.id === "file.duplicate")!
      .run();
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

test("Enter diffs a CRLF save against the LF buffer, without stray \\r", async () => {
  const h = await history("one\r\ntwo\r\n");
  await h.pick(false);
  expect(h.log[0]).toBe('diffWith "one\\ntwo\\n"');
});

test("restoring a save that equals the buffer changes nothing", async () => {
  const h = await history("same\n", "same\n");
  await h.pick(true);
  expect(h.log).toEqual(["say Already identical to that save"]);
});

test("a failing restore is reported, not swallowed", async () => {
  const h = await history("old\n", "new\n", true);
  await h.pick(true);
  expect(h.log).toEqual(["fail boom"]);
});
