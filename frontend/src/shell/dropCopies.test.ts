import { describe, expect, it } from "vitest";
import { copyDone, copyLabel, copyProgress } from "./dropCopies";

describe("dropCopies", () => {
  it("shows nothing without a running copy", () => {
    expect(copyLabel({})).toBeNull();
  });

  it("names a single copy and gives its percentage", () => {
    const s = copyProgress({}, { id: 1, name: "big.iso", done: 50, total: 200 });
    expect(copyLabel(s)).toEqual({ title: 'Copying "big.iso" into the folder: 25%', percent: 25 });
  });

  it("keeps two simultaneous drops, not only the last", () => {
    let s = copyProgress({}, { id: 1, name: "a", done: 100, total: 200 });
    s = copyProgress(s, { id: 2, name: "b", done: 0, total: 200 });
    expect(copyLabel(s)).toEqual({ title: "Copying 2 items into the folder: 25%", percent: 25 });
    s = copyProgress(s, { id: 1, name: "a", done: 150, total: 200 });
    expect(copyLabel(s)?.percent).toBe(37);
  });

  it("a finished drop leaves the other one showing", () => {
    let s = copyProgress({}, { id: 1, name: "a", done: 10, total: 100 });
    s = copyProgress(s, { id: 2, name: "b", done: 50, total: 100 });
    s = copyDone(s, 1);
    expect(copyLabel(s)).toEqual({ title: 'Copying "b" into the folder: 50%', percent: 50 });
    expect(copyLabel(copyDone(s, 2))).toBeNull();
  });

  it("ignores the end of a drop that never sent progress, like a small or early failed one", () => {
    const s = copyProgress({}, { id: 1, name: "a", done: 10, total: 100 });
    expect(copyDone(s, 7)).toEqual(s);
    expect(copyLabel(copyDone({}, 7))).toBeNull();
  });

  it("caps the percentage at 100 when a file grew while being copied", () => {
    expect(copyLabel(copyProgress({}, { id: 1, name: "a", done: 300, total: 200 }))?.percent).toBe(100);
  });
});
