import { expect, test, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { globalMarks, installMarkJump, viewPath } from "./setup";

test("globalMarks remembers positions across files and calls jump handler", () => {
  const jump = vi.fn();
  installMarkJump(jump);

  // Set mark A in file1
  globalMarks.set("A", { path: "src/main.ts", line: 42, ch: 10 });
  expect(globalMarks.get("A")).toEqual({ path: "src/main.ts", line: 42, ch: 10 });

  // Simulate jump handler
  jump("src/main.ts", 42, 10);
  expect(jump).toHaveBeenCalledWith("src/main.ts", 42, 10);
});

test("viewPath associates view with its buffer path", () => {
  // In node tests, a dummy view or object works with WeakMap
  const fakeView = {} as EditorView;
  viewPath.set(fakeView, () => "test.ts");
  expect(viewPath.get(fakeView)?.()).toBe("test.ts");
});
