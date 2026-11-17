// Test runner model: what a runner is called with and what its output means. No editor imports.

import type { Files } from "./backend";
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
// Where a run starts. `file` is workspace-relative; `name` is needed for "nearest"; `names` are the tests the file declares, for "file";
// the rest comes from `detect`.
export interface TestAt {
  file: string;
  name?: string;
  names?: string[];
  runner?: "vitest" | "jest" | "bun" | "node";
  pm?: string; // how vitest and jest are started: `bunx`, `pnpm exec` or `npx`
  pkgDir?: string; // the folder of the nearest package.json ("" for the workspace root)
}
export interface TestAdapter {
  id: string;
  exts: string[];
  // Reads the project (which runner it uses) before `command`, which stays pure.
  detect?(file: string, files: Pick<Files, "list" | "readText">): Promise<Partial<TestAt>>;
  // The shell line for a scope. `file` is workspace-relative.
  command(scope: Scope, at: TestAt): string;
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
  command(scope, { file, name, names }) {
    const slash = file.lastIndexOf("/");
    const pkg = slash < 0 ? "." : arg(`./${file.slice(0, slash)}`);
    if (scope === "all") {
      return "go test -v ./...";
    }
    if (scope === "file") {
      // go test runs packages, not files: the names this file declares keep the other files' tests out; none found (testsIn knows only *testing.T) runs the package
      return names?.length ? `go test -v -run ${q(`^(${names.join("|")})$`)} ${pkg}` : `go test -v ${pkg}`;
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

const dirOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0));

// One line of vitest (`✓ a.test.ts > group > title 3ms`, maybe `|project|` after the mark), jest (`✓ title (3 ms)`, `○ skipped title`)
// or bun (`(pass) group > title [0.5ms]`).
const JS_LINE =
  /^\s*(?:([✓✕×↓○])\s+(?:\|[^|]*\|\s+)?|\((pass|fail|skip|todo)\)\s+)(.*?)(\s+(?:\[(\d+(?:\.\d+)?)ms\]|\((\d+(?:\.\d+)?) ms\)|(\d+(?:\.\d+)?)ms))?\s*$/;
const JS_STATUS: Record<string, TestResult["status"]> = {
  "✓": "pass",
  "✕": "fail",
  "×": "fail",
  "↓": "skip",
  "○": "skip",
  pass: "pass",
  fail: "fail",
  skip: "skip",
  todo: "skip",
};

export const jsAdapter: TestAdapter = {
  id: "js",
  exts: ["ts", "tsx", "js", "jsx", "mjs"],
  // shortcut: the lock file of the package.json's own folder decides the package manager (no hoisted workspace root lookup)
  async detect(file, files) {
    for (let dir = dirOf(file); ; dir = dirOf(dir)) {
      const names = (await files.list(dir).catch(() => [])).filter((e) => !e.dir).map((e) => e.name);
      if (names.includes("package.json")) {
        const text = await files.readText(dir ? `${dir}/package.json` : "package.json").then(
          (f) => f.content,
          () => "",
        );
        let pkg: { dependencies?: object; devDependencies?: object; scripts?: Record<string, string> } = {};
        try {
          pkg = JSON.parse(text) ?? {};
        } catch {
          // a broken package.json still marks the folder; it just names no runner
        }
        const uses = (n: string) =>
          n in { ...pkg.dependencies, ...pkg.devDependencies } ||
          Object.values(pkg.scripts ?? {}).some((s) => String(s).includes(n));
        const bun = names.some((n) => /^bun\.lockb?$|^bunfig\.toml$/.test(n));
        const runner = uses("vitest") ? "vitest" : uses("jest") ? "jest" : bun ? "bun" : "node";
        const pm = names.some((n) => n.startsWith("bun.lock")) ? "bunx" : names.includes("pnpm-lock.yaml") ? "pnpm exec" : "npx";
        return { runner, pm, pkgDir: dir };
      }
      if (!dir) {
        return {};
      }
    }
  },
  command(scope, { file, name, runner = "node", pm = "npx", pkgDir = "" }) {
    if (scope === "nearest" && !name) {
      throw new Error("A nearest test needs a test name");
    }
    const rel = pkgDir ? file.slice(pkgDir.length + 1) : file;
    const base = {
      vitest: `${pm} vitest run --reporter=verbose`,
      jest: `${pm} jest --verbose`,
      bun: "bun test",
      node: "node --test",
    }[runner];
    // shortcut: the name is a pattern for the full title, so a test whose title only contains this one runs as well
    const pattern =
      scope === "nearest"
        ? ` ${runner === "node" ? "--test-name-pattern" : "-t"} ${q(name!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))}`
        : "";
    const target = scope === "all" ? "" : ` ${arg(runner === "bun" ? `./${rel}` : rel)}`; // bun takes a bare name as a filter
    const byPath = runner === "jest" && scope !== "all" ? " --runTestsByPath" : ""; // jest reads a bare target as a regex
    return `${pkgDir ? `cd ${arg(pkgDir)} && ` : ""}${base}${pattern}${byPath}${target}`;
  },
  // shortcut: matches by title, describe blocks are ignored; two tests with one title share a result (fail wins)
  parse(output) {
    const out: TestResult[] = [];
    for (const line of output.replace(ANSI, "").split(/\r?\n/)) {
      const m = JS_LINE.exec(line);
      if (m) {
        const status = JS_STATUS[m[1] ?? m[2]];
        // a skipped test has no duration, so a title ending in `100ms` keeps it
        const raw = status === "skip" ? m[3] + (m[4] ?? "") : m[3];
        const title = (m[1] === "○" ? raw.replace(/^skipped /, "") : raw).split(" > ").pop()!;
        const ms = status === "skip" ? undefined : (m[5] ?? m[6] ?? m[7]);
        out.push({ name: title, status, ...(ms === undefined ? {} : { ms: Math.round(Number(ms)) }) });
      }
    }
    return out;
  },
};

export const adapters = [goAdapter, jsAdapter];

// The shell line for a scope: the adapter's own, or the user's `tests` template from settings.json.
// A template with ${name} is for "nearest" only and one without it for "file"; "all" is always the adapter's own.
export function testCommand(a: TestAdapter, scope: Scope, at: TestAt, template?: string): string {
  const named = template?.includes("${name}") ?? false;
  if (template === undefined || scope === "all" || (named && scope !== "nearest")) {
    return a.command(scope, at);
  }
  if (scope === "nearest" && !named) {
    throw new Error(`No \${name} in your tests.${a.id} command`);
  }
  return expandTask(template, { file: at.file, name: at.name }) ?? template;
}

// The adapter for a path by its extension, or null when no runner knows it.
export function adapterFor(path: string): TestAdapter | null {
  const dot = path.lastIndexOf(".");
  const ext = dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
  return adapters.find((a) => a.exts.includes(ext)) ?? null;
}
