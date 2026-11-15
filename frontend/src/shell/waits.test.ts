import { expect, test } from "vitest";
import { Waits } from "./waits";

test("a callback fires once, when its file is no longer open", () => {
  const w = new Waits(), fired: string[] = [];
  w.add("COMMIT_EDITMSG", () => fired.push("a"));
  w.add("other.go", () => fired.push("b"));
  w.check(() => true);
  expect(fired).toEqual([]);
  w.check((p) => p === "other.go");
  expect(fired).toEqual(["a"]);
  w.check(() => false);
  expect(fired).toEqual(["a", "b"]);
  w.check(() => false); // nothing fires twice
  expect(fired).toEqual(["a", "b"]);
});

test("two waits on one file both end", () => {
  const w = new Waits();
  let n = 0;
  w.add("a", () => n++);
  w.add("a", () => n++);
  w.check(() => false);
  expect(n).toBe(2);
});
