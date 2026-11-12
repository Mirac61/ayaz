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
