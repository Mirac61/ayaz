// The quickfix list (Vim's :copen, :cn, :cp): project search hits and LSP references land here.

// One location. line is 1-based; col and len count UTF-16 units within the line, like CodeMirror.
export interface Loc { path: string; line: number; col: number; len: number; text: string }

const order = (a: Loc, b: Loc) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line || a.col - b.col);

export class Quickfix {
  items: Loc[] = [];
  title = "";
  index = -1; // the entry :cn/:cp moved to last, -1 before the first

  set(title: string, items: Loc[]) {
    this.title = title;
    this.items = [...items].sort(order);
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

// The text a location points at, from its line, or null if the line was cut short.
export const matchText = (l: Loc) => (l.col + l.len <= l.text.length ? l.text.slice(l.col, l.col + l.len) : null);

// Replace edits for one file's document: each location still showing its old text becomes `to`.
// Returns the edits and how many locations were skipped because the file changed since the search.
export function replaceEdits(locs: Loc[], doc: { lines: number; line(n: number): { from: number; text: string } }, to: string) {
  const changes: { from: number; to: number; insert: string }[] = [];
  let skipped = 0;
  for (const l of locs) {
    const old = matchText(l);
    const line = l.line <= doc.lines ? doc.line(l.line) : null;
    if (old === null || !line || line.text.slice(l.col, l.col + l.len) !== old) {
      skipped++;
      continue;
    }
    changes.push({ from: line.from + l.col, to: line.from + l.col + l.len, insert: to });
  }
  return { changes, skipped };
}
