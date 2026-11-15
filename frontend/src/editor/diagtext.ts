import { forEachDiagnostic, setDiagnosticsEffect, type Diagnostic } from "@codemirror/lint";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";

const RANK: Record<Diagnostic["severity"], number> = { error: 0, warning: 1, info: 2, hint: 3 };

class Message extends WidgetType {
  constructor(readonly text: string, readonly severity: string) { super(); }
  eq(other: Message) { return other.text === this.text && other.severity === this.severity; }
  toDOM() {
    const el = document.createElement("span");
    el.className = `cm-diag-text ${this.severity}`;
    el.textContent = this.text;
    return el;
  }
  ignoreEvent() { return true; }
}

// The worst diagnostic of every line in view, as text after the line, like nvim's virtual text.
function build(view: EditorView): DecorationSet {
  const worst = new Map<number, Diagnostic>(); // line start → diagnostic
  const { doc } = view.state;
  const top = view.viewport.from, bottom = view.viewport.to;
  forEachDiagnostic(view.state, (d, from) => {
    if (from < top || from > bottom) return;
    const line = doc.lineAt(from).from;
    const old = worst.get(line);
    if (!old || RANK[d.severity] < RANK[old.severity]) worst.set(line, d);
  });
  const out = new RangeSetBuilder<Decoration>();
  for (const [from, d] of [...worst].sort((a, b) => a[0] - b[0])) {
    const text = d.message.split("\n")[0];
    out.add(doc.lineAt(from).to, doc.lineAt(from).to, Decoration.widget({ widget: new Message(text, d.severity), side: 1 }));
  }
  return out.finish();
}

// The message of a line's worst diagnostic after its text. Shown or hidden by html[data-diag-text] (view.diagnosticText).
export const diagnosticText = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.transactions.some((t) => t.effects.some((e) => e.is(setDiagnosticsEffect)))) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
