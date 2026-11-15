import { expect, test } from "vitest";
import { Jumps } from "./jumps";

test("back and forward like a browser; a new jump clears forward", () => {
  const j = new Jumps();
  j.push({ path: "a", pos: 1 }); // a → b
  j.push({ path: "b", pos: 2 }); // b → c
  expect(j.go(-1, { path: "c", pos: 3 })).toEqual({ path: "b", pos: 2 });
  expect(j.go(-1, { path: "b", pos: 2 })).toEqual({ path: "a", pos: 1 });
  expect(j.go(-1, { path: "a", pos: 1 })).toBeUndefined();
  expect(j.go(1, { path: "a", pos: 1 })).toEqual({ path: "b", pos: 2 });
  j.push({ path: "b", pos: 2 }); // b → d
  expect(j.go(1, { path: "d", pos: 0 })).toBeUndefined();
  expect(j.go(-1, { path: "d", pos: 0 })).toEqual({ path: "b", pos: 2 });
});
