import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

// <Space>gb: who last changed the cursor line, at its end, until the cursor or the text moves.

export interface BlameInfo { hash: string; author: string; time: number; summary: string; committed: boolean }

// "3 days ago": the biggest unit that fits, like git's own --date=relative.
export function ago(seconds: number, now = Date.now() / 1000): string {
  const d = Math.max(0, now - seconds);
  const units: [string, number][] = [
    ["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60],
  ];
  for (const [name, size] of units) {
    if (d >= size) {
      const n = Math.floor(d / size);
      return `${n} ${name}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

export function blameText(b: BlameInfo, now?: number): string {
  if (!b.committed) return "Not committed yet";
  return `${b.author}, ${ago(b.time, now)} • ${b.hash} ${b.summary}`;
}

class BlameWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(o: BlameWidget) { return o.text === this.text; }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-blame";
    s.textContent = this.text;
    return s;
  }
  ignoreEvent() { return true; }
}

const show = StateEffect.define<{ at: number; text: string }>();
const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(d, tr) {
    for (const e of tr.effects) {
      if (!e.is(show)) continue;
      return Decoration.set(Decoration.widget({ widget: new BlameWidget(e.value.text), side: 1 }).range(e.value.at));
    }
    return tr.docChanged || tr.selection ? Decoration.none : d;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.baseTheme({
  ".cm-blame": { color: "#727169", fontStyle: "italic", paddingLeft: "3ch" }, // kanagawa's comment color
});

export const inlineBlame: Extension = [field, theme];

// Shows text at the end of the line the cursor is on.
export function showBlame(view: EditorView, text: string) {
  view.dispatch({ effects: show.of({ at: view.state.doc.lineAt(view.state.selection.main.head).to, text }) });
}
