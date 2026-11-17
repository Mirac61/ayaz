import { RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";
import { adapterFor } from "../core/tests";
import { testsIn } from "./tests";

// One marker per test function, as the test runner last reported it: ▶ never run, ✓ pass, ✗ fail, ○ skipped.
// Typing fades the markers (cm-test-stale) until the next run brings new results; the colours are not recomputed.

export type TestStatus = "pass" | "fail" | "skip";

// Replaces the file's results (test name → status). A name without a test function in the file is ignored.
export const setTestResults = StateEffect.define<Map<string, TestStatus>>();

interface Shown {
  results: Map<string, TestStatus>;
  stale: boolean;
}

const field = StateField.define<Shown>({
  create: () => ({ results: new Map(), stale: false }),
  update(v, tr) {
    for (const e of tr.effects) {
      if (e.is(setTestResults)) {
        return { results: e.value, stale: false };
      }
    }
    return tr.docChanged && !v.stale ? { ...v, stale: true } : v;
  },
});

const GLYPH = { idle: "", pass: "", fail: "", skip: "" }; // Nerd Font: play, check, times, circle-o

class Mark extends GutterMarker {
  constructor(
    private kind: keyof typeof GLYPH,
    private stale: boolean,
  ) {
    super();
  }
  eq(o: Mark) {
    return o.kind === this.kind && o.stale === this.stale;
  }
  toDOM() {
    const d = document.createElement("span");
    d.className = `cm-test cm-test-${this.kind}${this.stale ? " cm-test-stale" : ""}`;
    d.textContent = GLYPH[this.kind];
    return d;
  }
}

const theme = EditorView.baseTheme({
  ".cm-testgutter .cm-gutterElement": { width: "16px", textAlign: "center", cursor: "pointer" },
  ".cm-test-idle": { color: "var(--status-view)" },
  ".cm-test-pass": { color: "var(--status-insert)" },
  ".cm-test-fail": { color: "var(--status-error)" },
  ".cm-test-skip": { color: "var(--status-warning)" },
  ".cm-test-stale": { opacity: "0.35" },
});

// run: a click on a marker; the cursor is on the test's line by then.
export function testGutter(path: string, run: (view: EditorView, line: number) => void): Extension {
  if (!adapterFor(path)) {
    return [];
  }
  return [
    field,
    gutter({
      class: "cm-testgutter",
      markers: (v) => {
        const { results, stale } = v.state.field(field);
        return RangeSet.of(
          testsIn(v.state, path).map((t) => new Mark(results.get(t.name) ?? "idle", stale).range(v.state.doc.line(t.line).from)),
        );
      },
      domEventHandlers: {
        mousedown(view, block) {
          const line = view.state.doc.lineAt(block.from).number;
          if (!testsIn(view.state, path).some((t) => t.line === line)) {
            return false;
          }
          view.dispatch({ selection: { anchor: block.from } });
          run(view, line);
          return true;
        },
      },
    }),
    theme,
  ];
}
