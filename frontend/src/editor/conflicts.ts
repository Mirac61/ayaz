import { StateField, type Extension, type Range, type Text } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

// Merge conflicts (M62): the markers git leaves in a file, coloured blocks, taking ours, theirs or both, and jumps.
//   <<<<<<< ours          line numbers are 1-based
//   ...
//   ||||||| base          (only with merge.conflictStyle diff3)
//   ...
//   =======
//   ...
//   >>>>>>> theirs

export interface Conflict { start: number; base: number | null; mid: number; end: number }

const BIG = 2_000_000; // characters; a bigger file isn't scanned, a conflict in it is rare and the scan is per edit

// Complete blocks only: a half-typed marker or a stray "=======" (Markdown underline) is no conflict.
export function findConflicts(doc: Text): Conflict[] {
  const out: Conflict[] = [];
  let start = 0, base: number | null = null, mid = 0;
  for (let n = 1; n <= doc.lines; n++) {
    const t = doc.line(n).text;
    if (/^<{7}( |$)/.test(t)) [start, base, mid] = [n, null, 0];
    else if (start && !mid && /^\|{7}( |$)/.test(t)) base = n;
    else if (start && !mid && /^={7}$/.test(t)) mid = n;
    else if (start && mid && /^>{7}( |$)/.test(t)) {
      out.push({ start, base, mid, end: n });
      start = 0;
    }
  }
  return out;
}

// The conflict the cursor line is in (markers included), null outside.
export const conflictAt = (cs: readonly Conflict[], line: number) => cs.find((c) => line >= c.start && line <= c.end) ?? null;

export type Pick = "ours" | "theirs" | "both";

// The text that replaces the whole block (markers included) for a pick; every line keeps its newline.
export function resolved(doc: Text, c: Conflict, pick: Pick): string {
  const lines = (from: number, to: number) => (from > to ? "" : doc.sliceString(doc.line(from).from, doc.line(to).to) + "\n");
  const ours = lines(c.start + 1, (c.base ?? c.mid) - 1), theirs = lines(c.mid + 1, c.end - 1);
  return pick === "ours" ? ours : pick === "theirs" ? theirs : ours + theirs;
}

interface Found { conflicts: readonly Conflict[]; deco: DecorationSet }

function decorate(doc: Text, conflicts: readonly Conflict[]): DecorationSet {
  const line = (cls: string) => Decoration.line({ class: cls });
  const marks: Range<Decoration>[] = [];
  for (const c of conflicts) {
    for (let n = c.start; n <= c.end; n++) {
      const marker = n === c.start || n === c.base || n === c.mid || n === c.end;
      const part = n < (c.base ?? c.mid) ? "ours" : c.base !== null && n < c.mid ? "base" : "theirs";
      marks.push(line(marker ? `cm-conflict-marker cm-conflict-${part}-marker` : `cm-conflict-${part}`).range(doc.line(n).from));
    }
  }
  return Decoration.set(marks);
}

const scan = (doc: Text): Found => {
  const conflicts = doc.length > BIG ? [] : findConflicts(doc);
  return { conflicts, deco: decorate(doc, conflicts) };
};

const field = StateField.define<Found>({
  create: (s) => scan(s.doc),
  update(f, tr) {
    if (!tr.docChanged) return f;
    // With none in the file, only text that has a marker in it can start one; with some, every edit may change them.
    let marker = false;
    if (!f.conflicts.length) {
      tr.changes.iterChanges((_a, _b, _c, _d, text) => {
        if (/[<=>|]{7}/.test(text.toString())) marker = true;
      });
    }
    return f.conflicts.length || marker ? scan(tr.newDoc) : f;
  },
  provide: (f) => EditorView.decorations.from(f, (x) => x.deco),
});

const theme = EditorView.baseTheme({
  ".cm-conflict-ours": { backgroundColor: "rgb(118 148 106 / 0.16)" }, // kanagawa autumnGreen
  ".cm-conflict-theirs": { backgroundColor: "rgb(126 156 216 / 0.16)" }, // crystalBlue
  ".cm-conflict-base": { backgroundColor: "rgb(255 255 255 / 0.06)" },
  ".cm-conflict-marker": { fontWeight: "bold" },
  ".cm-conflict-ours-marker": { backgroundColor: "rgb(118 148 106 / 0.32)" },
  ".cm-conflict-theirs-marker": { backgroundColor: "rgb(126 156 216 / 0.32)" },
  ".cm-conflict-base-marker": { backgroundColor: "rgb(255 255 255 / 0.12)" },
});

export const conflictMarks: Extension = [field, theme];

export const conflictsOf = (view: EditorView) => view.state.field(field, false)?.conflicts ?? [];

// Replaces the conflict under the cursor with ours, theirs or both. false: the cursor is in none.
export function resolveConflict(view: EditorView, pick: Pick): boolean {
  const s = view.state, c = conflictAt(conflictsOf(view), s.doc.lineAt(s.selection.main.head).number);
  if (!c) return false;
  const from = s.doc.line(c.start).from, to = Math.min(s.doc.line(c.end).to + 1, s.doc.length);
  const insert = resolved(s.doc, c, pick);
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from }, userEvent: "git.resolve" });
  return true;
}

// ]x / [x: the next or previous conflict's first line, wrapping around. false: none in the file.
export function moveConflict(view: EditorView, d: 1 | -1): boolean {
  const s = view.state, cur = s.doc.lineAt(s.selection.main.head).number, starts = conflictsOf(view).map((c) => c.start);
  if (!starts.length) return false;
  const before = [...starts].reverse().find((l) => l < cur) ?? starts[starts.length - 1];
  const next = d > 0 ? starts.find((l) => l > cur) ?? starts[0] : before;
  const pos = s.doc.line(next).from;
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
  return true;
}
