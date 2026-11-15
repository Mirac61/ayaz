// The quickfix list (Vim's :copen, :cn, :cp): project search hits and LSP references land here.

// One location. line is 1-based; col and len count UTF-16 units within the line, like CodeMirror.
// groups: a regex search's $1, $2, … ("" if one took no part).
export interface Loc { path: string; line: number; col: number; len: number; text: string; groups?: string[] }

const order = (a: Loc, b: Loc) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line || a.col - b.col);

export class Quickfix {
  items: Loc[] = [];
  title = "";
  index = -1; // the entry :cn/:cp moved to last, -1 before the first
  regex = false; // the list came from a regex search, so :Replace expands $1, $2

  // sort=false keeps the caller's order (diagnostics: errors first).
  set(title: string, items: Loc[], regex = false, sort = true) {
    this.title = title;
    this.regex = regex;
    this.items = sort ? [...items].sort(order) : [...items];
    this.index = -1;
  }

  // Moves by d entries and returns the new one, null at either end (like Vim's "No more items").
  move(d: number): Loc | null {
    const i = this.index < 0 && d > 0 ? 0 : this.index + d;
    if (i < 0 || i >= this.items.length) return null;
    this.index = i;
    return this.items[i];
  }

  select(i: number) { this.index = i; return this.items[i]; }
}

export const label = (l: Loc) => `${l.path}:${l.line}:${l.col + 1}: ${l.text.trim()}`;

// Code point positions of the match inside label(l), for the picker to mark: the label is "path:line:col: " and the
// line's text without the whitespace around it. Empty when there is no match length (diagnostics) or it sits in that whitespace.
export function hitPositions(l: Loc): number[] {
  const lead = l.text.length - l.text.trimStart().length;
  if (!l.len || l.col < lead) return [];
  const trimmed = Array.from(l.text.trim()).length;
  const start = Array.from(label(l)).length - trimmed + Array.from(l.text.slice(lead, l.col)).length;
  const n = Array.from(l.text.slice(l.col, l.col + l.len)).length;
  const end = Math.min(start + n, Array.from(label(l)).length);
  return Array.from({ length: Math.max(end - start, 0) }, (_, i) => start + i);
}

// The text a location points at, from its line, or null if the line was cut short.
export const matchText = (l: Loc) => (l.col + l.len <= l.text.length ? l.text.slice(l.col, l.col + l.len) : null);

// What replaces l. After a regex search $1…$9 are its groups, $0 the whole match and $$ a "$"; otherwise `to` stays as it is.
export const replacement = (l: Loc, to: string, regex: boolean) =>
  regex ? to.replace(/\$([0-9$])/g, (_, g: string) => (g === "$" ? "$" : g === "0" ? matchText(l) ?? "" : l.groups?.[Number(g) - 1] ?? "")) : to;

// Replace edits for one file's document: each location still showing its old text gets its replacement.
// Returns the edits and how many locations were skipped because the file changed since the search.
export function replaceEdits(locs: Loc[], doc: { lines: number; line(n: number): { from: number; text: string } }, to: string, regex = false) {
  const changes: { from: number; to: number; insert: string }[] = [];
  let skipped = 0;
  for (const l of locs) {
    const old = matchText(l);
    const line = l.line <= doc.lines ? doc.line(l.line) : null;
    if (old === null || !line || line.text.slice(l.col, l.col + l.len) !== old) {
      skipped++;
      continue;
    }
    changes.push({ from: line.from + l.col, to: line.from + l.col + l.len, insert: replacement(l, to, regex) });
  }
  return { changes, skipped };
}
