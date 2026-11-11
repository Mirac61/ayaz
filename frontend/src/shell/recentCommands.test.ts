import { expect, test } from "vitest";
import { touch } from "./recentCommands";

test("a picked command moves to the front without doubling", () => {
  expect(touch(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  expect(touch([], "a")).toEqual(["a"]);
});

test("only the latest few are kept", () => {
  const six = ["1", "2", "3", "4", "5", "6"];
  expect(touch(six, "7")).toEqual(["7", "1", "2", "3", "4", "5"]);
});
