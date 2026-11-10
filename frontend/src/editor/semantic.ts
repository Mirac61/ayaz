import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { LSPPlugin } from "@codemirror/lsp-client";
import { settings } from "../core/settings";
import { palette as c } from "../theme/cm-theme";
import { applyEdits, decodeTokens, tokenClass, type DataEdit, type Legend } from "./semantic-tokens";

// Semantic tokens from the language server, over the syntax highlighting: the server knows a name is a parameter
// or a type where the grammar only sees an identifier. lsp-client has none, so this asks for them itself.
// Off with "semanticTokens": false in settings.json.

interface Provider { legend: Legend; full?: boolean | { delta?: boolean } }
type Answer = { resultId?: string; data?: number[]; edits?: DataEdit[] };

const setTokens = StateEffect.define<DecorationSet>();
const tokenField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(d, tr) {
    for (const e of tr.effects) if (e.is(setTokens)) return e.value;
    return d.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const DELAY = 250; // after typing stops
// shortcut: no tokens in documents over 400 KB, a full answer for one is slow to decode and paint; ask for ranges then.
const MAX_DOC = 400_000;

const fetcher = ViewPlugin.fromClass(class {
  timer = 0;
  gone = false;
  resultId = "";
  data: number[] = [];
  constructor(readonly view: EditorView) { this.schedule(); }

  // A saved settings.json reconfigures every editor: tokens go on or off then.
  update(u: ViewUpdate) {
    if (u.docChanged || u.transactions.some((t) => t.reconfigured)) this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.fetch(), DELAY);
  }

  async fetch() {
    const view = this.view;
    const plugin = LSPPlugin.get(view);
    if (!plugin) return;
    if (!settings().semanticTokens) return this.show(Decoration.none);
    const { client } = plugin;
    if (!client.connected) return void client.initializing.then(() => this.schedule(), () => {});
    const provider = client.serverCapabilities?.semanticTokensProvider as Provider | undefined;
    const doc = view.state.doc;
    if (!provider?.full || doc.length > MAX_DOC) return;
    client.sync();
    const textDocument = { uri: plugin.uri };
    const delta = typeof provider.full === "object" && provider.full.delta && this.resultId;
    const answer = await (delta
      ? client.request<object, Answer | null>("textDocument/semanticTokens/full/delta", { textDocument, previousResultId: this.resultId })
      : client.request<object, Answer | null>("textDocument/semanticTokens/full", { textDocument }))
      .catch(() => null);
    if (this.gone) return;
    if (!answer) { // the server moved on (content modified) or has no delta for that ID: start over with a full answer
      this.resultId = "";
      return this.schedule();
    }
    this.data = answer.edits ? applyEdits(this.data, answer.edits) : answer.data ?? [];
    this.resultId = answer.resultId ?? "";
    if (view.state.doc !== doc) return; // typed meanwhile: the next fetch is on its way
    const ranges = decodeTokens(this.data, provider.legend).flatMap((t) => {
      if (!t.type || t.line >= doc.lines) return [];
      const line = doc.line(t.line + 1);
      const from = Math.min(line.from + t.start, line.to), to = Math.min(from + t.length, line.to);
      return from < to ? [Decoration.mark({ class: tokenClass(t) }).range(from, to)] : [];
    });
    this.show(Decoration.set(ranges, true));
  }

  show(d: DecorationSet) {
    if (d.size || this.view.state.field(tokenField).size) this.view.dispatch({ effects: setTokens.of(d) });
  }

  destroy() {
    this.gone = true;
    clearTimeout(this.timer);
  }
});

// Only what the grammar can't tell: names by what they are. Variables, strings, numbers and keywords stay as they are.
const theme = EditorView.baseTheme({
  ".cm-sem-namespace, .cm-sem-type, .cm-sem-class, .cm-sem-struct, .cm-sem-interface, .cm-sem-enum, .cm-sem-typeParameter": { color: c.type },
  ".cm-sem-function, .cm-sem-method": { color: c.fn },
  ".cm-sem-parameter": { color: c.param },
  ".cm-sem-enumMember, .cm-sem-readonly": { color: c.constant },
  ".cm-sem-macro, .cm-sem-decorator": { color: c.special },
  ".cm-sem-deprecated": { textDecoration: "line-through" },
});

export const semanticTokens: Extension = [tokenField, fetcher, theme];

// What the client tells the server it understands, in the order the legend of a standard server lists them.
export const SEMANTIC_CAPABILITY = {
  requests: { full: { delta: true } },
  tokenTypes: [
    "namespace", "type", "class", "enum", "interface", "struct", "typeParameter", "parameter", "variable", "property",
    "enumMember", "event", "function", "method", "macro", "keyword", "modifier", "comment", "string", "number", "regexp",
    "operator", "decorator",
  ],
  tokenModifiers: ["declaration", "definition", "readonly", "static", "deprecated", "abstract", "async", "modification", "documentation", "defaultLibrary"],
  formats: ["relative"],
};
