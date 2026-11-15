import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { LSPPlugin } from "@codemirror/lsp-client";

// Marks the other occurrences of the symbol under the cursor (textDocument/documentHighlight), once the cursor
// has rested. Typing or moving clears them at once; nothing is asked per key.

interface Pos { line: number; character: number }
interface Highlight { range: { start: Pos; end: Pos }; kind?: number } // kind 3 is a write

const set = StateEffect.define<DecorationSet>();
const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(d, tr) {
    for (const e of tr.effects) if (e.is(set)) return e.value;
    return tr.docChanged || tr.selection ? Decoration.none : d;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const DELAY = 350; // the cursor rests this long

const fetcher = ViewPlugin.fromClass(class {
  timer = 0;
  constructor(readonly view: EditorView) {}

  update(u: ViewUpdate) {
    if (u.docChanged || u.selectionSet) this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.fetch(), DELAY);
  }

  async fetch() {
    const view = this.view;
    const plugin = LSPPlugin.get(view);
    const { head, empty } = view.state.selection.main;
    if (!plugin?.client.connected || !plugin.client.serverCapabilities?.documentHighlightProvider || !empty) return;
    const doc = view.state.doc;
    plugin.client.sync();
    const found = await plugin.client.request<object, Highlight[] | null>("textDocument/documentHighlight", {
      textDocument: { uri: plugin.uri }, position: plugin.toPosition(head, doc),
    }).catch(() => null);
    if (!found || view.state.doc !== doc || view.state.selection.main.head !== head) return; // moved on meanwhile
    const marks = found.flatMap((h) => {
      const from = plugin.fromPosition(h.range.start, doc), to = plugin.fromPosition(h.range.end, doc);
      const cls = h.kind === 3 ? "cm-docHighlight cm-docHighlight-write" : "cm-docHighlight";
      return from < to ? [Decoration.mark({ class: cls }).range(from, to)] : [];
    });
    if (marks.length > 1) view.dispatch({ effects: set.of(Decoration.set(marks, true)) }); // the symbol alone isn't worth a mark
  }

  destroy() { clearTimeout(this.timer); }
});

const theme = EditorView.baseTheme({
  ".cm-docHighlight": { backgroundColor: "rgb(255 255 255 / 0.1)", borderRadius: "2px" },
  ".cm-docHighlight-write": { backgroundColor: "rgb(255 160 102 / 0.22)" }, // kanagawa constant, where the symbol is assigned
});

export const documentHighlight: Extension = [field, fetcher, theme];
