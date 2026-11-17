// Test runner model: what a runner is called with and what its output means. No editor imports.

import { escape, expandTask } from "./tasks";

export type Scope = "nearest" | "file" | "all";
export interface TestRef {
  name: string;
  line: number; // 1-based line of the test function
}
export interface TestResult {
  name: string;
  pkg?: string; // the package or module the runner reported it under, when the output names it
  status: "pass" | "fail" | "skip";
  ms?: number;
}
export interface TestAdapter {
  id: string;
  exts: string[];
  // The shell line for a scope. `file` is workspace-relative; `name` is needed for "nearest".
  command(scope: Scope, at: { file: string; name?: string }): string;
  parse(output: string): TestResult[];
}

// shortcut: POSIX sh quoting only, like expandTask
const q = escape.none;
// Paths made of plain characters stay readable in the terminal; anything else is quoted.
const arg = (s: string) => (/^[\w./-]+$/.test(s) ? s : q(s));
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
// The package line `go test` prints after a package's tests: `ok  \tpkg\t0.1s`, `FAIL\tpkg\t0.2s`, `FAIL\tpkg [build failed]`.
const GO_PKG = /^(?:ok|FAIL)\s+(\S+)/;
const GO_LINE = /^\s*--- (PASS|FAIL|SKIP): (\S+) \((\d+(?:\.\d+)?)s\)/;
const STATUS = { PASS: "pass", FAIL: "fail", SKIP: "skip" } as const;

export const goAdapter: TestAdapter = {
  id: "go",
  exts: ["go"],
  command(scope, { file, name }) {
    const slash = file.lastIndexOf("/");
    const pkg = slash < 0 ? "." : arg(`./${file.slice(0, slash)}`);
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
    let open = 0; // results of the package whose line has not been seen yet
    for (const line of output.replace(ANSI, "").split(/\r?\n/)) {
      const m = GO_LINE.exec(line);
      if (m) {
        out.push({ name: m[2], status: STATUS[m[1] as keyof typeof STATUS], ms: Math.round(Number(m[3]) * 1000) });
        open++;
        continue;
      }
      const p = GO_PKG.exec(line);
      if (p) {
        // `./...` runs many packages: the package line follows its tests, so it names them in the output
        for (const r of out.slice(out.length - open)) {
          r.pkg = p[1];
        }
        open = 0;
      }
    }
    return out;
  },
};

export const adapters = [goAdapter];

// The shell line for a scope: the adapter's own, or the user's `tests` template from settings.json (all three scopes).
export function testCommand(a: TestAdapter, scope: Scope, at: { file: string; name?: string }, template?: string): string {
  if (template === undefined) {
    return a.command(scope, at);
  }
  if (scope === "nearest" && !template.includes("${name}")) {
    throw new Error(`No \${name} in your tests.${a.id} command`);
  }
  return expandTask(template, { file: at.file, name: scope === "nearest" ? at.name : undefined }) ?? template;
}

// The adapter for a path by its extension, or null when no runner knows it.
export function adapterFor(path: string): TestAdapter | null {
  const dot = path.lastIndexOf(".");
  const ext = dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
  return adapters.find((a) => a.exts.includes(ext)) ?? null;
}
