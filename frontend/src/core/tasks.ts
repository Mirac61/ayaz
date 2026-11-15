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
    if (!m) continue;
    let path = m[1].replace(/\\/g, "/").replace(/^\.\//, "");
    if (normRoot && path.toLowerCase().startsWith(normRoot.toLowerCase() + "/")) {
      path = path.slice(normRoot.length + 1);
    }
    out.push({ path, line: Number(m[2]), col: m[3] ? Number(m[3]) - 1 : 0, len: 0, text: m[4].trim() });
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
    if (after.includes("compiled successfully")) return [];
    return parseProblems(after, root);
  }

  // 2. Explicit loop delimiters (e.g. LaTeX watcher in docBuild)
  const markerIdx = output.lastIndexOf("--- compiling ---");
  if (markerIdx !== -1) {
    const after = output.slice(markerIdx);
    if (after.includes("--- success ---")) return [];
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
    if (after.includes("Found 0 errors")) return [];
    return parseProblems(after, root);
  }

  return parseProblems(output, root);
}
