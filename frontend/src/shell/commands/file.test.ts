import { EditorState } from "@codemirror/state";
import { expect, test } from "vitest";
import type { Buffer } from "../../core/buffers";
import type { Files } from "../../core/backend";
import type { PickerSource } from "../Picker";
import type { Ctx } from "./context";
import { fileCommands } from "./file";

// A Ctx with just what file.history touches: one open buffer, two saves in the history.
async function history(old: string, current = "new text\n") {
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
        const next = ch.reduce((t, x) => t.slice(0, x.from) + x.insert + t.slice(x.to), current);
        log.push(`edit -> ${JSON.stringify(next)}`);
      },
      diffWith: () => void log.push("diffWith"),
    },
    say: (t: string) => void log.push(`say ${t}`),
    fail: (t: string) => void log.push(`fail ${t}`),
    setPicker: (p: PickerSource | null) => void (picker = p),
  } as unknown as Ctx;
  await fileCommands(c).find((x) => x.id === "file.history")!.run();
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
  expect(h.log).not.toContain("diffWith");
  expect(h.log[1]).toMatch(/^say Restored the save before .*: unsaved, u undoes it$/);

  const d = await history("old text\n");
  await d.pick(false);
  expect(d.log[0]).toBe("diffWith");
  expect(d.log.some((l) => l.startsWith("edit"))).toBe(false);
});

test("a save with CRLF is restored with LF", async () => {
  const h = await history("one\r\ntwo\r\n");
  await h.pick(true);
  expect(h.log[0]).toBe('edit -> "one\\ntwo\\n"');
});
