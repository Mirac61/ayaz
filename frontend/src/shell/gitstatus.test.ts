import { expect, test } from "vitest";
import { gitMarks } from "./gitstatus";

test("own state, strongest state below a folder, inherited from ignored and untracked folders", () => {
  const m = gitMarks({ "a/b/c.go": "M", "a/new.go": "?", "a/x.log": "!", "a/b/d.go": "U", build: "!", fresh: "?", top: "A" });
  expect(m("a/b/c.go")).toBe("M");
  expect(m("a/b")).toBe("U");
  expect(m("a")).toBe("U");
  expect(m("a/x.log")).toBe("!");
  expect(m("build/out/x.o")).toBe("!");
  expect(m("fresh/f.txt")).toBe("?");
  expect(m("top")).toBe("A");
  expect(m("clean.go")).toBeUndefined();
  expect(gitMarks({ "a/x.log": "!" })("a")).toBeUndefined();
});
