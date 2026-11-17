// Tasks (M52): named commands from settings.json, run in a terminal split. What they print is read for problems.

import type { Loc } from "./quickfix";

// A path ends in a file extension, so URLs with ports and clock times don't count. A prefix like "vet: " may come first.
// Supports Windows drive letters (e.g. C:\path\to\file.go) and backslashes.
const PATH = String.raw`(?:^|\s)((?:[a-zA-Z]:[\\/])?[^\s:()]*[\w-]\.[A-Za-z0-9]+)`;
const colon = new RegExp(PATH + String.raw`:(\d+)(?::(\d+))?(?::| -)\s*(.*)$`); // Go, gcc/clang, tsc --pretty
const paren = new RegExp(PATH + String.raw`\((\d+),(\d+)\):\s*(.*)$`); // tsc

// The locations in a task's output: `file:line:col: text`, `file:line: text` and tsc's `file(line,col): text`.
// Paths inside root become workspace-relative; columns turn 0-based like the rest of the quickfix list.
export function parseProblems(output: string, root: string): Loc[] {
  const normRoot = root.replace(/\\/g, "/").replace(/\/$/, "");
  const out: Loc[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const m = colon.exec(raw) ?? paren.exec(raw);
    if (!m) {
      continue;
    }
    let path = m[1].replace(/\\/g, "/").replace(/^\.\//, "");
    if (normRoot && path.toLowerCase().startsWith(normRoot.toLowerCase() + "/")) {
      path = path.slice(normRoot.length + 1);
    }
    out.push({ path, line: Number(m[2]), col: m[3] ? Number(m[3]) - 1 : 0, len: 0, text: m[4].trim() });
  }
  return out;
}

// Fills ${file}, ${dir} and ${line} of a task for the active file: its workspace-relative path, its folder ("." in the
// root) and the 1-based cursor line. Any other ${...} stays (${HOME} is shell syntax). Null when the task needs a file
// and none is open.
// Values are escaped for the quotes the placeholder sits in, so a path stays literal in `cat ${file}`, `'${file}'`
// and `"${file}"` alike. Where the scan can't tell the quoting (after $(, `, <<, $', ${x:-..}, any unquoted # since
// it may start a comment, or with unbalanced quotes) a ${file} or ${dir} throws instead of guessing.
// shortcut: POSIX sh/bash/zsh quoting only; commands that re-parse their argument (sh -c "…${file}", eval, ssh) and
// Windows shells are not covered
const UNMODELLED = /\$\(|`|<<|\$'|\$\{(?![A-Za-z_]\w*\})|#/y;
export const escape = {
  none: (s: string) => `'${s.replace(/'/g, "'\\''")}'`,
  single: (s: string) => s.replace(/'/g, "'\\''"),
  double: (s: string) => s.replace(/[$`"\\]/g, "\\$&"),
};
// An argv as one shell line (a debug adapter's runInTerminal): plain words stay readable, the rest is single-quoted.
export const shellLine = (args: string[]) => args.map((a) => (/^[\w./-]+$/.test(a) ? a : escape.none(a))).join(" ");

export function expandTask(cmd: string, at: { file?: string; line?: number; name?: string }): string | null {
  // ${name} (a test's name) counts only when the caller has one
  const keys = at.name === undefined ? "file|dir|line" : "file|dir|line|name";
  if (!new RegExp(String.raw`\$\{(${keys})\}`).test(cmd)) {
    return cmd;
  }
  if (at.file === undefined) {
    return null;
  }
  const { file } = at,
    slash = file.lastIndexOf("/");
  const vals = { file, dir: slash < 0 ? "." : file.slice(0, slash), line: String(at.line ?? 1), name: at.name ?? "" };
  const ph = new RegExp(String.raw`\$\{(${keys})\}`, "y");
  let out = "",
    ctx: keyof typeof escape = "none",
    unmodelled = "",
    path = false;
  for (let i = 0; i < cmd.length;) {
    ph.lastIndex = i;
    const m = ph.exec(cmd);
    if (m) {
      const k = m[1] as keyof typeof vals;
      if (k !== "line" && unmodelled) {
        throw new Error(`\${${k}} can't follow ${unmodelled.trim()} in a task, put it outside`);
      }
      path ||= k !== "line";
      out += k === "line" ? vals.line : escape[ctx](vals[k]);
      i = ph.lastIndex;
      continue;
    }
    UNMODELLED.lastIndex = i;
    const u = ctx === "single" ? null : UNMODELLED.exec(cmd);
    if (u && (ctx === "none" || u[0] === "$(" || u[0] === "`" || u[0].startsWith("${"))) {
      unmodelled ||= u[0];
    }
    const c = cmd[i];
    if (c === "\\" && ctx !== "single") {
      out += cmd.slice(i, i + 2); // an escaped character stays as written
      i += 2;
      continue;
    }
    if (c === "'" && ctx !== "double") {
      ctx = ctx === "single" ? "none" : "single";
    } else if (c === '"' && ctx !== "single") {
      ctx = ctx === "double" ? "none" : "double";
    }
    out += c;
    i++;
  }
  if (path && ctx !== "none") {
    throw new Error("A task with ${file} or ${dir} needs balanced quotes");
  }
  return out;
}

// parseWatcherProblems parses problem locations from long-running watcher output (typst watch, tectonic loops, etc.).
// It extracts problems from the latest compilation cycle and returns an empty list if the latest compile succeeded.
export function parseWatcherProblems(output: string, root: string): Loc[] {
  // 1. Typst watch: cycles start with "compiling ..." or "[..:..:..] compiling ..."
  const typstIdx = Math.max(output.lastIndexOf("compiling ..."), output.lastIndexOf("compiling"));
  if (typstIdx !== -1) {
    const after = output.slice(typstIdx);
    if (after.includes("compiled successfully")) {
      return [];
    }
    return parseProblems(after, root);
  }

  // 2. Explicit loop delimiters (e.g. LaTeX watcher in docBuild)
  const markerIdx = output.lastIndexOf("--- compiling ---");
  if (markerIdx !== -1) {
    const after = output.slice(markerIdx);
    if (after.includes("--- success ---")) {
      return [];
    }
    return parseProblems(after, root);
  }

  // 3. TypeScript watch mode (tsc --watch)
  const tscWatchIdx = Math.max(
    output.lastIndexOf("Starting compilation in watch mode..."),
    output.lastIndexOf("Starting incremental compilation..."),
    output.lastIndexOf("File change detected."),
  );
  if (tscWatchIdx !== -1) {
    const after = output.slice(tscWatchIdx);
    if (after.includes("Found 0 errors")) {
      return [];
    }
    return parseProblems(after, root);
  }

  return parseProblems(output, root);
}
