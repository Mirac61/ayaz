import { beforeEach, expect, test } from "vitest";
import { loadHarpoon, removeHarpoon, saveHarpoon, toggleHarpoon } from "./harpoon";

const ROOT = "/test/project";

const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
};
Object.defineProperty(globalThis, "localStorage", { value: fakeStorage, writable: true });

beforeEach(() => {
  fakeStorage.clear();
});

test("loadHarpoon returns empty array initially", () => {
  expect(loadHarpoon(ROOT)).toEqual([]);
});

test("toggleHarpoon adds and removes files", () => {
  const r1 = toggleHarpoon(ROOT, "src/main.go");
  expect(r1.added).toBe(true);
  expect(r1.index).toBe(1);
  expect(r1.items).toEqual(["src/main.go"]);
  expect(loadHarpoon(ROOT)).toEqual(["src/main.go"]);

  const r2 = toggleHarpoon(ROOT, "src/server.go");
  expect(r2.added).toBe(true);
  expect(r2.index).toBe(2);
  expect(r2.items).toEqual(["src/main.go", "src/server.go"]);

  const r3 = toggleHarpoon(ROOT, "src/main.go");
  expect(r3.added).toBe(false);
  expect(r3.index).toBe(1);
  expect(r3.items).toEqual(["src/server.go"]);
});

test("removeHarpoon removes file at index", () => {
  saveHarpoon(ROOT, ["a.go", "b.go", "c.go"]);
  expect(removeHarpoon(ROOT, 1)).toEqual(["a.go", "c.go"]);
  expect(loadHarpoon(ROOT)).toEqual(["a.go", "c.go"]);
});
