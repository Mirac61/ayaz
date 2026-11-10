import { describe, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { Buffers, diff, isDirty } from "./buffers";
import type { Files } from "./backend";

// In-memory Files with the same conflict rule as Go's WriteText.
function fakeFiles(init: Record<string, string>) {
  const disk = new Map(Object.entries(init).map(([p, c]) => [p, { content: c, mtime: 1 }]));
  let clock = 1;
  const swaps = new Map<string, string>();
  const files: Files = {
    list: async () => [],
    find: async () => [],
    grep: () => ({ done: Promise.resolve(null), cancel() {} }),
    create: async () => {},
    rename: async () => {},
    trash: async () => {},
    reveal: async () => {},
    gitBranch: async () => "",
    gitHead: async () => ({ text: "", tracked: false }),
    gitStatus: async () => ({}),
    swapWrite: async (path, text) => void swaps.set(path, text),
    swapRemove: async (path) => void swaps.delete(path),
    swaps: async () => [...swaps].map(([path, text]) => ({ path, text })),
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
  return { files, disk, touch, swaps };
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

  test("checkDisk: own save is same, clean reloads, dirty conflicts, matching dirty turns clean", async () => {
    const { bufs, disk, touch } = make({ "a.go": "x" });
    const b = await bufs.open("a.go");
    b.state = edit(b.state, "y");
    await bufs.save(b);
    expect(await bufs.checkDisk(b)).toEqual({ kind: "same" });

    touch("a.go", "theirs");
    expect(await bufs.checkDisk(b)).toEqual({ kind: "reload", content: "theirs", mtime: disk.get("a.go")!.mtime });

    b.state = edit(b.state, "z");
    expect(await bufs.checkDisk(b)).toEqual({ kind: "conflict" });

    touch("a.go", b.state.doc.toString());
    expect(await bufs.checkDisk(b)).toEqual({ kind: "same" });
    expect(isDirty(b)).toBe(false);
    await bufs.save(b); // mtime was taken over, so no conflict
  });

  test("checkDisk: deleted file, and a new buffer that never was on disk", async () => {
    const { bufs, disk } = make({ "a.go": "x" });
    const b = await bufs.open("a.go");
    disk.delete("a.go");
    expect(await bufs.checkDisk(b)).toEqual({ kind: "deleted" });
    expect(await bufs.checkDisk(await bufs.open("new.go"))).toEqual({ kind: "same" });
  });
});

test("syncSwaps: dirty buffers keep their text in a swap, clean ones lose it", async () => {
  const { bufs, swaps } = make({ "a.go": "x", "b.go": "y" });
  const a = await bufs.open("a.go"), b = await bufs.open("b.go");
  await bufs.syncSwaps();
  expect(swaps.size).toBe(0); // nothing unsaved

  a.state = edit(a.state, "1");
  await bufs.syncSwaps();
  expect(swaps).toEqual(new Map([["a.go", "1x"]]));

  swaps.set("a.go", "stale"); // not written again while the text stays the same
  await bufs.syncSwaps();
  expect(swaps.get("a.go")).toBe("stale");
  a.state = edit(a.state, "2");
  await bufs.syncSwaps();
  expect(swaps.get("a.go")).toBe("21x");

  b.state = edit(b.state, "3");
  await bufs.syncSwaps();
  await bufs.save(a);
  await bufs.syncSwaps();
  expect(swaps).toEqual(new Map([["b.go", "3y"]])); // :w drops the swap

  bufs.drop("b.go"); // renamed or trashed: its swap goes too
  await bufs.syncSwaps();
  expect(swaps.size).toBe(0);
});

test("syncSwaps: a restored swap goes once the buffer is saved", async () => {
  const { bufs, swaps } = make({ "a.go": "x" });
  swaps.set("a.go", "from last time");
  const a = await bufs.open("a.go");
  a.state = edit(a.state, "restored ");
  bufs.adoptSwap(a);
  await bufs.save(a);
  await bufs.syncSwaps();
  expect(swaps.size).toBe(0);
});

test("syncSwaps: a swap that fails to write is tried again", async () => {
  const { bufs, swaps, files } = make({ "a.go": "x" });
  const a = await bufs.open("a.go");
  a.state = edit(a.state, "1");
  const write = files.swapWrite;
  files.swapWrite = async () => { throw new Error("disk full"); };
  await expect(bufs.syncSwaps()).rejects.toThrow("disk full");
  files.swapWrite = write;
  await bufs.syncSwaps();
  expect(swaps.get("a.go")).toBe("1x");
});

test("diff replaces only the changed middle", () => {
  expect(diff("abcXdef", "abcYYdef")).toEqual({ from: 3, to: 4, insert: "YY" });
  expect(diff("aaa", "aa")).toEqual({ from: 2, to: 3, insert: "" });
  expect(diff("", "new")).toEqual({ from: 0, to: 0, insert: "new" });
  expect(diff("same", "same")).toEqual({ from: 4, to: 4, insert: "" });
});
