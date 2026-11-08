import { describe, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { Buffers, isDirty } from "./buffers";
import type { Files } from "./backend";

// In-memory Files with the same conflict rule as Go's WriteText.
function fakeFiles(init: Record<string, string>) {
  const disk = new Map(Object.entries(init).map(([p, c]) => [p, { content: c, mtime: 1 }]));
  let clock = 1;
  const files: Files = {
    list: async () => [],
    find: async () => [],
    readText: async (path) => {
      const f = disk.get(path);
      if (!f) throw new Error(`open /x/${path}: no such file or directory`);
      return { path, ...f };
    },
    writeText: async (path, content, expected) => {
      if ((disk.get(path)?.mtime ?? 0) !== expected) throw new Error("file changed on disk");
      disk.set(path, { content, mtime: ++clock });
      return clock;
    },
  };
  const touch = (path: string, content: string) => disk.set(path, { content, mtime: ++clock });
  return { files, disk, touch };
}

const make = (init: Record<string, string>) => {
  const f = fakeFiles(init);
  return { ...f, bufs: new Buffers(f.files, async (_p, doc) => EditorState.create({ doc })) };
};
const edit = (s: EditorState, text: string) => s.update({ changes: { from: 0, insert: text } }).state;

describe("Buffers", () => {
  test("open reads once, edits mark dirty, save clears it", async () => {
    const { bufs, disk } = make({ "a.go": "x" });
    const b = await bufs.open("a.go");
    expect(await bufs.open("a.go")).toBe(b);
    expect(isDirty(b)).toBe(false);
    b.state = edit(b.state, "y");
    expect(bufs.dirty()).toEqual([b]);
    await bufs.save(b);
    expect(disk.get("a.go")?.content).toBe("yx");
    expect(isDirty(b)).toBe(false);
    await bufs.save(b); // mtime was updated, so a second save is no conflict
  });

  test("external change is a conflict, force overwrites", async () => {
    const { bufs, disk, touch } = make({ "a.go": "x" });
    const b = await bufs.open("a.go");
    touch("a.go", "theirs");
    b.state = edit(b.state, "mine ");
    await expect(bufs.save(b)).rejects.toThrow("file changed on disk");
    expect(disk.get("a.go")?.content).toBe("theirs");
    await bufs.save(b, true);
    expect(disk.get("a.go")?.content).toBe("mine x");
  });

  test("missing file opens empty and is created on save", async () => {
    const { bufs, disk } = make({});
    const b = await bufs.open("new.txt");
    expect(b.state.doc.toString()).toBe("");
    b.state = edit(b.state, "hi");
    await bufs.save(b);
    expect(disk.get("new.txt")?.content).toBe("hi");
  });

  test("load drops unsaved changes", async () => {
    const { bufs } = make({ "a.go": "x" });
    const b = await bufs.open("a.go");
    b.state = edit(b.state, "y");
    const fresh = await bufs.load("a.go");
    expect(fresh.state.doc.toString()).toBe("x");
    expect(bufs.dirty()).toEqual([]);
  });
});
