import { expect, test } from "vitest";
import { goAdapter, lldbAdapter, pickAdapter, pythonAdapter } from "./adapters";

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

test("pickAdapter returns pythonAdapter for .py files with exact file as target", () => {
  const file = pickAdapter("script.py");
  expect(file.adapter.id).toBe("python");
  expect(file.adapter.binary).toBe("debugpy");
  expect(file.adapter.adapterId).toBe("python");
  expect(file.target).toBe("script.py");

  const nested = pickAdapter("src/app/main.py");
  expect(nested.adapter.id).toBe("python");
  expect(nested.target).toBe("src/app/main.py");
});

test("pythonAdapter launch generates correct arguments", () => {
  expect(pythonAdapter.launch("/root/script.py", "/root")).toEqual({
    request: "launch",
    program: "/root/script.py",
    cwd: "/root",
    console: "integratedTerminal",
  });
});

test("pickAdapter returns lldbAdapter for Rust (.rs) and C/C++ (.c, .cpp)", () => {
  const rs = pickAdapter("src/main.rs");
  expect(rs.adapter.id).toBe("lldb");
  expect(rs.adapter.binary).toBe("lldb-dap");
  expect(rs.adapter.adapterId).toBe("lldb-dap");
  expect(rs.target).toBe("target/debug");

  const c = pickAdapter("src/main.c");
  expect(c.adapter.id).toBe("lldb");
  expect(c.target).toBe("main");

  const cpp = pickAdapter("server.cpp");
  expect(cpp.adapter.id).toBe("lldb");
  expect(cpp.target).toBe("server");
});

test("lldbAdapter launch generates correct arguments", () => {
  expect(lldbAdapter.launch("/root/target/debug", "/root")).toEqual({
    request: "launch",
    program: "/root/target/debug",
    cwd: "/root",
    console: "integratedTerminal",
  });
});
