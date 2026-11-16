// `path:line` and `path:line:col` in terminal output (compiler errors, test failures, stack traces) as clickable links.

export interface FileLink { start: number; end: number; path: string; line: number; col?: number } // start..end: a half-open range of string indices

// A path chunk right after a boundary: not in the middle of a word, and not after "://" or "host:" (the ":" is excluded).
// What follows the numbers must not continue the token: that rules out "host.com:443/x".
const LINK = /(?<![\w./@+~:-])([\w./@+~-]+):(\d+)(?::(\d+))?(?![\w/])/g;

// The path needs a "/" or an extension that starts with a letter, so "12:30:45" and "localhost:8080" are no links.
// shortcut: POSIX paths only, Windows drive letters and backslashes are not matched
const isPath = (p: string) => p.includes("/") || /\.[A-Za-z]\w*$/.test(p);

export function fileLinks(text: string): FileLink[] {
  const out: FileLink[] = [];
  for (const m of text.matchAll(LINK)) {
    if (!isPath(m[1])) continue;
    out.push({ start: m.index, end: m.index + m[0].length, path: m[1], line: Number(m[2]), col: m[3] ? Number(m[3]) : undefined });
  }
  return out;
}

// The workspace-relative path of a link: relative ones count from the shell's folder (unknown: the workspace root),
// absolute ones are cut to the root. Null outside the root; ".." is resolved before that is checked.
export function resolveLink(path: string, cwd: string, root: string): string | null {
  const parts: string[] = [];
  for (const seg of (path.startsWith("/") ? path : `${cwd || root}/${path}`).split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  const base = root.split("/").filter(Boolean);
  if (parts.length <= base.length || base.some((s, i) => s !== parts[i])) return null;
  return parts.slice(base.length).join("/");
}
