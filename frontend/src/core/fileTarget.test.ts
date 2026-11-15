import { expect, test } from "vitest";
import { fileTarget } from "./fileTarget";

test("a name with a line, and with a column", () => {
  expect(fileTarget("src/app.go:42")).toEqual({ text: "src/app.go", line: 42 });
  expect(fileTarget("src/app.go:42:7")).toEqual({ text: "src/app.go", line: 42, col: 7 });
});

test("anything else is just the name", () => {
  expect(fileTarget("src/app.go")).toEqual({ text: "src/app.go" });
  expect(fileTarget("app.go:")).toEqual({ text: "app.go:" });
  expect(fileTarget(":42")).toEqual({ text: ":42" });
  expect(fileTarget("a:b:3x")).toEqual({ text: "a:b:3x" });
});
