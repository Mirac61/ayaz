import { afterEach, expect, test, vi } from "vitest";
import { defaultKeymap, keyName, mergeKeymap, parseKeys, parseUserKeymap, Sequencer, type Binding } from "./keymap";

const ev = (key: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}, code = "") =>
  ({ key, code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

test("parseKeys normalizes Vim notation", () => {
  expect(parseKeys("<Space>ff")).toEqual(["<Space>", "f", "f"]);
  expect(parseKeys("<S-C-P>")).toEqual(["<C-S-p>"]);
  expect(parseKeys("<c-w>h")).toEqual(["<C-w>", "h"]);
  expect(parseKeys("<F1>")).toEqual(["<F1>"]);
});

test("keyName matches parseKeys", () => {
  expect(keyName(ev(" "))).toBe("<Space>");
  expect(keyName(ev("J", { shiftKey: true }, "KeyJ"))).toBe("J");
  expect(keyName(ev("P", { ctrlKey: true, shiftKey: true }, "KeyP"))).toBe(parseKeys("<C-S-p>")[0]);
  expect(keyName(ev("π", { altKey: true }, "KeyP"))).toBe("<A-p>"); // macOS Option types a symbol
  expect(keyName(ev("p", { metaKey: true }, "KeyP"))).toBe("<D-p>");
  expect(keyName(ev("Shift", { shiftKey: true }))).toBe("");
  expect(keyName(ev("F1"))).toBe("<F1>");
});

test("user bindings replace or remove defaults per context and keys", () => {
  const d: Binding[] = [
    { keys: "<Space>ff", command: "find.files", context: "normal" },
    { keys: "<Space>e", command: "tree.focus", context: "normal" },
    { keys: "<D-p>", command: "find.files", context: "global" },
  ];
  const merged = mergeKeymap(d, [
    { keys: "<space>ff", command: "find.recent", context: "normal" },
    { keys: "<Space>e", command: "", context: "normal" },
    { keys: "<D-p>", command: "find.commands", context: "normal" }, // other context: both stay
  ]);
  expect(merged.map((b) => `${b.context} ${b.keys} ${b.command}`)).toEqual([
    "global <D-p> find.files",
    "normal <space>ff find.recent",
    "normal <D-p> find.commands",
  ]);
});

test("parseUserKeymap rejects bad entries with a readable message", () => {
  const known = (id: string) => id === "find.files";
  expect(parseUserKeymap('[{"keys":"<Space>p","command":"find.files"}]', known))
    .toEqual([{ keys: "<Space>p", command: "find.files", context: "normal" }]);
  expect(() => parseUserKeymap('{"a":1}', known)).toThrow("list of bindings");
  expect(() => parseUserKeymap('[{"keys":"x","command":"nope"}]', known)).toThrow('unknown command "nope"');
  expect(() => parseUserKeymap('[{"keys":"x","command":"","context":"insert"}]', known)).toThrow("context");
});

test("defaults have no duplicate keys per context", () => {
  for (const mac of [true, false]) {
    const ids = defaultKeymap(mac).map((b) => `${b.context} ${parseKeys(b.keys).join("")}`);
    expect(new Set(ids).size).toBe(ids.length);
  }
});

afterEach(() => vi.useRealTimers());

test("Sequencer: sequences, prefixes with timeout, fallthrough", () => {
  vi.useFakeTimers();
  const fired: string[] = [];
  const s = new Sequencer((b) => fired.push(b.command));
  const bs: Binding[] = [
    { keys: "<Space>t", command: "term", context: "normal" },
    { keys: "<Space>tc", command: "termSplit", context: "normal" },
    { keys: "<Space>ff", command: "files", context: "normal" },
  ];
  expect(s.feed("j", bs)).toBe(false);
  expect(s.feed("<Space>", bs)).toBe(true);
  expect(s.feed("f", bs)).toBe(true);
  expect(s.feed("f", bs)).toBe(true);
  expect(fired).toEqual(["files"]);

  s.feed("<Space>", bs); s.feed("t", bs); s.feed("c", bs);
  expect(fired).toEqual(["files", "termSplit"]);

  s.feed("<Space>", bs); s.feed("t", bs);
  vi.advanceTimersByTime(400);
  expect(fired).toEqual(["files", "termSplit", "term"]);

  // a dead end drops the prefix and tries the key on its own
  s.feed("<Space>", bs);
  expect(s.feed("j", bs)).toBe(false);
  vi.advanceTimersByTime(400);
  expect(fired.length).toBe(3);

  // prime: Vim already read "<Space>t"; the next key is matched against bs even if the caller passes others
  s.prime("<Space>t", bs);
  expect(s.feed("c", [])).toBe(true);
  expect(fired).toEqual(["files", "termSplit", "term", "termSplit"]);
  s.prime("<Space>t", bs);
  expect(s.feed("x", [])).toBe(false); // not a continuation: the prefix runs now, x goes on to Vim
  expect(fired[fired.length - 1]).toBe("term");
  vi.advanceTimersByTime(400);
  expect(fired.length).toBe(5);
});
