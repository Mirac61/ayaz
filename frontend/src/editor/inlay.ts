import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { LSPPlugin } from "@codemirror/lsp-client";
import { settings } from "../core/settings";

// Inlay hints (parameter names, inferred types) for the visible lines, when settings.json has "inlayHints": true.
// lsp-client has none, so this asks textDocument/inlayHint itself.

interface Hint {
  position: { line: number; character: number };
  label: string | { value: string }[];
  paddingLeft?: boolean;
  paddingRight?: boolean;
}

class HintWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(o: HintWidget) { return o.text === this.text; }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-inlay-hint";
    s.textContent = this.text;
    return s;
  }
}

const setHints = StateEffect.define<DecorationSet>();
const hintField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(d, tr) {
    for (const e of tr.effects) if (e.is(setHints)) return e.value;
    return d.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const DELAY = 250; // after typing or scrolling stops

const fetcher = ViewPlugin.fromClass(class {
  timer = 0;
  gone = false;
  constructor(readonly view: EditorView) { this.schedule(); }

  // A saved settings.json reconfigures every editor: hints go on or off then.
  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged || u.transactions.some((t) => t.reconfigured)) this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.fetch(), DELAY);
  }

  async fetch() {
    const view = this.view;
    const plugin = LSPPlugin.get(view);
    if (!settings().inlayHints || !plugin) return this.show(Decoration.none);
    const { client } = plugin;
    if (!client.connected) return void client.initializing.then(() => this.schedule(), () => {});
    if (!client.serverCapabilities?.inlayHintProvider) return;
    client.sync();
    const doc = view.state.doc;
    const range = { start: plugin.toPosition(view.viewport.from, doc), end: plugin.toPosition(view.viewport.to, doc) };
    const hints = await client.request<object, Hint[] | null>("textDocument/inlayHint", { textDocument: { uri: plugin.uri }, range })
      .catch(() => null);
    if (this.gone || view.state.doc !== doc) return; // typed meanwhile: the next fetch is on its way
    const decos = (hints ?? []).map((h) => {
      const label = typeof h.label === "string" ? h.label : h.label.map((p) => p.value).join("");
      const text = (h.paddingLeft ? " " : "") + label + (h.paddingRight ? " " : "");
      return Decoration.widget({ widget: new HintWidget(text), side: 1 }).range(plugin.fromPosition(h.position, doc));
    });
    this.show(Decoration.set(decos, true));
  }

  show(d: DecorationSet) {
    if (d.size || this.view.state.field(hintField).size) this.view.dispatch({ effects: setHints.of(d) });
  }

  destroy() {
    this.gone = true;
    clearTimeout(this.timer);
  }
});

const theme = EditorView.baseTheme({
  ".cm-inlay-hint": { color: "var(--syn-comment, #727169)", fontSize: "0.9em" }, // the theme's comment color
});

export const inlayHints: Extension = [hintField, fetcher, theme];
