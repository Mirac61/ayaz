import { expect, test } from "vitest";
import { goAdapter, pickAdapter } from "./adapters";

test("pickAdapter returns goAdapter for .go files with package directory as target", () => {
  const root = pickAdapter("main.go");
  expect(root.adapter.id).toBe("go");
  expect(root.adapter.binary).toBe("dlv");
  expect(root.adapter.adapterId).toBe("go");
  expect(root.target).toBe("");

  const sub = pickAdapter("pkg/server/server.go");
  expect(sub.adapter.id).toBe("go");
  expect(sub.target).toBe("pkg/server");
});

test("pickAdapter falls back to goAdapter for null, empty, or unknown extensions", () => {
  expect(pickAdapter(null)).toEqual({ adapter: goAdapter, target: "" });
  expect(pickAdapter("")).toEqual({ adapter: goAdapter, target: "" });
  expect(pickAdapter("README.md")).toEqual({ adapter: goAdapter, target: "" });
  expect(pickAdapter("test.txt")).toEqual({ adapter: goAdapter, target: "" });
});

test("goAdapter launch generates correct arguments", () => {
  expect(goAdapter.launch("/root/pkg/server", "/root")).toEqual({
    mode: "debug",
    program: "/root/pkg/server",
    cwd: "/root",
    console: "integratedTerminal",
  });
});
