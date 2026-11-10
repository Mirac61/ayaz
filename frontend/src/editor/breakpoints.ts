import { RangeSet, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";

// Breakpoints of the debugger (M48 D3): a red dot in a gutter column per line, kept per buffer. They follow edits
// (a line moving down takes its dot along, a deleted line loses it), and the session keeps them between runs.

class Dot extends GutterMarker {
  toDOM() {
    const d = document.createElement("span");
    d.className = "cm-bp-dot";
    return d;
  }
}
const DOT = new Dot();

// Line starts, sorted and unique.
const field = StateField.define<number[]>({
  create: () => [],
  update(starts, tr) {
    for (const e of tr.effects) {
      if (!e.is(setLines)) continue;
      const doc = tr.state.doc;
      return unique(tr.state, e.value.map((n) => doc.line(Math.min(Math.max(n, 1), doc.lines)).from));
    }
    if (!tr.docChanged || !starts.length) return starts;
    // A dot on a line that an edit deletes whole (its text and its break) is gone; the others move with their text:
    // assoc 1, so text inserted at a line's start goes before it and the dot stays with what was there.
    const old = tr.startState.doc, deleted: [number, number][] = [];
    tr.changes.iterChangedRanges((fromA, toA) => deleted.push([fromA, toA]));
    const kept = starts.filter((p) => {
      const line = old.lineAt(p), end = Math.min(line.to + 1, old.length);
      return !deleted.some(([from, to]) => from <= line.from && to >= end && to > from);
    });
    return unique(tr.state, kept.map((p) => tr.changes.mapPos(p, 1)));
  },
});

const unique = (s: EditorState, positions: number[]) =>
  [...new Set(positions.map((p) => s.doc.lineAt(Math.min(p, s.doc.length)).from))].sort((a, b) => a - b);

// Replaces all breakpoints with these lines (1-based).
export const setLines = StateEffect.define<number[]>();

export const breakpointLines = (s: EditorState): number[] => (s.field(field, false) ?? []).map((p) => s.doc.lineAt(p).number);

// Toggles a breakpoint on the cursor line; true when there is one now.
export function toggleBreakpoint(view: EditorView): boolean {
  const s = view.state, line = s.doc.lineAt(s.selection.main.head).number;
  const lines = breakpointLines(s), has = lines.includes(line);
  view.dispatch({ effects: setLines.of(has ? lines.filter((l) => l !== line) : [...lines, line]) });
  return !has;
}

const theme = EditorView.baseTheme({
  ".cm-bp .cm-gutterElement": { width: "12px", display: "flex", alignItems: "center", justifyContent: "center" },
  ".cm-bp-dot": { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--error, #e82424)" }, // kanagawa samuraiRed
});

export const breakpointGutter: Extension = [
  field,
  gutter({
    class: "cm-bp",
    markers: (v) => RangeSet.of((v.state.field(field, false) ?? []).map((p) => DOT.range(p))),
    initialSpacer: () => DOT,
  }),
  theme,
];
