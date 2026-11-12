import { settings } from "../core/settings";
import { extOf } from "../lang/registry";

// One row per debuggable language, like lang/registry.ts: adding one is a row here and the command in app/dap.go.
export interface DebugAdapter {
  id: string; // what the "dap" stream is told; app/dap.go maps it to the adapter's command
  binary: string; // the program that has to be installed: the missing status and the install hint (editor/lsp.ts) name it
  adapterId: string; // `initialize`
  // What to debug for the file at this workspace-relative path: a path relative to the folder ("" is the folder itself).
  target(path: string): string;
  // The arguments of the `launch` request, for the absolute path target() led to.
  launch(program: string, root: string): object;
}

export const goAdapter: DebugAdapter = {
  id: "go",
  binary: "dlv",
  adapterId: "go",
  target: (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""), // Delve debugs a package: the file's folder
  launch: (program, root) => ({ mode: "debug", program, cwd: root, console: "integratedTerminal" }),
};

export const pythonAdapter: DebugAdapter = {
  id: "python",
  binary: "debugpy",
  adapterId: "python",
  target: (path) => path,
  launch: (program, root) => ({ request: "launch", program, cwd: root, console: "integratedTerminal" }),
};

export const lldbAdapter: DebugAdapter = {
  id: "lldb",
  binary: "lldb-dap",
  adapterId: "lldb-dap",
  target: (path) => {
    const s = settings().debugProgram;
    if (s) return s;
    if (extOf(path) === "rs") return "target/debug";
    const base = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
    return base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
  },
  launch: (program, root) => ({ request: "launch", program, cwd: root, console: "integratedTerminal" }),
};

const byExt: Record<string, DebugAdapter> = {
  go: goAdapter,
  py: pythonAdapter,
  rs: lldbAdapter,
  c: lldbAdapter,
  h: lldbAdapter,
  cpp: lldbAdapter,
  cc: lldbAdapter,
  cxx: lldbAdapter,
  hpp: lldbAdapter,
  hxx: lldbAdapter,
};

// The adapter for the active file, and what it debugs (workspace-relative). Any other file (or none) debugs the folder's
// Go package, as before there was a table.
export function pickAdapter(path: string | null): { adapter: DebugAdapter; target: string } {
  const adapter = path ? byExt[extOf(path)] : undefined;
  return adapter ? { adapter, target: adapter.target(path!) } : { adapter: goAdapter, target: "" };
}
