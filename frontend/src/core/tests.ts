// Test runner model: what a runner is called with and what its output means. No editor imports.

import { escape } from "./tasks";

export type Scope = "nearest" | "file" | "all";
export interface TestRef {
  name: string;
  line: number; // 1-based line of the test function
}
export interface TestResult {
  name: string;
  status: "pass" | "fail" | "skip";
  ms?: number;
}
export interface TestAdapter {
  id: string;
  exts: string[];
  // The shell line for a scope. `file` is workspace-relative, `dir` its folder ("." in the root); `name` is needed for "nearest".
  command(scope: Scope, at: { file: string; dir: string; name?: string }): string;
  parse(output: string): TestResult[];
}

// shortcut: POSIX sh quoting only, like expandTask
const q = escape.none;
// Paths made of plain characters stay readable in the terminal; anything else is quoted.
const arg = (s: string) => (/^[\w./-]+$/.test(s) ? s : q(s));
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const GO_LINE = /^\s*--- (PASS|FAIL|SKIP): (\S+) \((\d+(?:\.\d+)?)s\)/;
const STATUS = { PASS: "pass", FAIL: "fail", SKIP: "skip" } as const;

export const goAdapter: TestAdapter = {
  id: "go",
  exts: ["go"],
  command(scope, { dir, name }) {
    const pkg = dir === "." ? "." : arg(`./${dir}`);
    if (scope === "all") {
      return "go test -v ./...";
    }
    if (scope === "file") {
      return `go test -v ${pkg}`;
    }
    if (!name) {
      throw new Error("A nearest test needs a test name");
    }
    return `go test -v -run ${q(`^${name}$`)} ${pkg}`;
  },
  // shortcut: reads the `--- PASS|FAIL|SKIP` lines of `go test -v` as text, not `-json`; upgrade if output gets interleaved
  parse(output) {
    const out: TestResult[] = [];
    for (const line of output.replace(ANSI, "").split(/\r?\n/)) {
      const m = GO_LINE.exec(line);
      if (m) {
        out.push({ name: m[2], status: STATUS[m[1] as keyof typeof STATUS], ms: Math.round(Number(m[3]) * 1000) });
      }
    }
    return out;
  },
};

const adapters = [goAdapter];

// The adapter for a path by its extension, or null when no runner knows it.
export function adapterFor(path: string): TestAdapter | null {
  const dot = path.lastIndexOf(".");
  const ext = dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
  return adapters.find((a) => a.exts.includes(ext)) ?? null;
}
