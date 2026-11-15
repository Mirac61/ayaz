import { expect, test } from "vitest";
import { Commands } from "./commands";

test("register, run with arg, list by title, unregister", () => {
  const c = new Commands();
  const got: (string | undefined)[] = [];
  const off = c.register(
    { id: "b", title: "Beta", run: (a) => got.push(a) },
    { id: "a", title: "Alpha", run: () => 1 },
  );
  c.run("b", "!");
  expect(got).toEqual(["!"]);
  expect(c.list().map((x) => x.id)).toEqual(["a", "b"]);
  expect(() => c.register({ id: "a", title: "x", run() {} })).toThrow("twice");
  off();
  expect(c.has("a")).toBe(false);
  expect(() => c.run("a")).toThrow("unknown command: a");
});
