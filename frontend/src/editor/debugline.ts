import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

// The line the debugger stopped on (M48 D4): one at a time, in the buffer's state so every view of the file shows it.
// null clears it. It follows edits like any decoration; it goes when the program runs on or the session ends.

export const setDebugLine = StateEffect.define<number | null>(); // 1-based

const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(d, tr) {
    for (const e of tr.effects) {
      if (!e.is(setDebugLine)) continue;
      if (e.value === null || e.value < 1 || e.value > tr.state.doc.lines) return Decoration.none;
      return Decoration.set(Decoration.line({ class: "cm-debug-line" }).range(tr.state.doc.line(e.value).from));
    }
    return d.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.baseTheme({
  ".cm-debug-line": { backgroundColor: "rgb(230 195 132 / 0.18)", boxShadow: "inset 3px 0 0 #e6c384" }, // kanagawa carpYellow
});

export const debugLine: Extension = [field, theme];

// The stopped line of a state, 1-based, null if none.
export function debugLineOf(s: EditorState): number | null {
  const d = s.field(field, false);
  if (!d || !d.size) return null;
  return s.doc.lineAt(d.iter().from).number;
}
