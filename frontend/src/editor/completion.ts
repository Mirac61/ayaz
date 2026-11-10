import {
  autocompletion, snippet, type Completion, type CompletionContext, type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { LSPPlugin } from "@codemirror/lsp-client";

// Completion from the language server. lsp-client has its own source, but it drops additionalTextEdits (the import
// that goes with `fmt.Println` typed before `import "fmt"`) and never resolves an item, so this one is ours: the
// same request and the same snippets ($1, ${1:name}), plus the extra edits, taken from the item or from
// completionItem/resolve for servers that send them only on demand.

interface Pos { line: number; character: number }
interface TextEdit { range: { start: Pos; end: Pos }; newText: string }
interface Item {
  label: string; kind?: number; detail?: string; sortText?: string; insertText?: string; insertTextFormat?: number;
  textEdit?: TextEdit | { newText: string; insert: TextEdit["range"] }; textEditText?: string; commitCharacters?: string[];
  documentation?: string | { kind: "markdown" | "plaintext"; value: string };
  additionalTextEdits?: TextEdit[];
}
interface Result {
  items: Item[]; isIncomplete?: boolean;
  itemDefaults?: {
    commitCharacters?: string[]; editRange?: TextEdit["range"] | { insert: TextEdit["range"] }; insertTextFormat?: number;
  };
}

const KIND: Record<number, string> = {
  1: "text", 2: "method", 3: "function", 4: "class", 5: "property", 6: "variable", 7: "class", 8: "interface", 9: "namespace",
  10: "property", 11: "keyword", 12: "constant", 13: "enum", 14: "keyword", 15: "text", 16: "constant", 17: "text", 18: "class",
  19: "namespace", 20: "enum", 21: "constant", 22: "class", 23: "keyword", 24: "keyword", 25: "type",
};

const textOf = (i: Item) =>
  (i.textEdit && "newText" in i.textEdit ? i.textEdit.newText : "") || i.textEditText || i.insertText || i.label;

// The range every item replaces (the word being typed), from the defaults or the first item's edit.
function replaced(cx: CompletionContext, r: Result): { from: number; to: number } {
  const def = r.itemDefaults?.editRange, first = r.items[0]?.textEdit;
  const edit = def ?? first;
  const range = !edit ? null : "insert" in edit ? edit.insert : "range" in edit ? edit.range : edit;
  if (!range) return cx.state.wordAt(cx.pos) ?? { from: cx.pos, to: cx.pos };
  const line = cx.state.doc.lineAt(cx.pos);
  return { from: line.from + range.start.character, to: line.from + range.end.character };
}

// Applies the item: its extra edits first (they lie elsewhere, usually the import block), then the text at the
// replaced range, mapped through them. One user event, so the pick undoes together with what it added.
async function apply(plugin: LSPPlugin, item: Item, view: EditorView, from: number, to: number) {
  const { client } = plugin;
  const doc = view.state.doc; // the edits' positions are against this text
  let extra = item.additionalTextEdits;
  if (extra === undefined && client.serverCapabilities?.completionProvider?.resolveProvider) {
    extra = await client.request<Item, Item>("completionItem/resolve", item).then((r) => r.additionalTextEdits, () => undefined);
  }
  const text = textOf(item);
  if (extra?.length && view.state.doc === doc) { // typed meanwhile (a slow resolve): the extra edits are dropped
    const changes = view.state.changes(extra.map((e) => ({
      from: plugin.fromPosition(e.range.start, doc), to: plugin.fromPosition(e.range.end, doc), insert: e.newText,
    })));
    view.dispatch({ changes, userEvent: "input.complete" });
    from = changes.mapPos(from, -1);
    to = changes.mapPos(to, 1);
  }
  if (item.insertTextFormat === 2) {
    snippet(text.replace(/\$(\d+)/g, "${$1}"))(view, null as never, from, to);
  } else {
    const selection = { anchor: from + text.length };
    view.dispatch({ changes: { from, to, insert: text }, selection, userEvent: "input.complete" });
  }
}

async function source(cx: CompletionContext): Promise<CompletionResult | null> {
  const plugin = cx.view && LSPPlugin.get(cx.view);
  const caps = plugin?.client.serverCapabilities;
  if (!plugin || (caps && !caps.completionProvider)) return null;
  let triggerCharacter = "";
  if (!cx.explicit) {
    triggerCharacter = cx.state.sliceDoc(cx.pos - 1, cx.pos);
    const triggers = plugin.client.serverCapabilities?.completionProvider?.triggerCharacters;
    if (!/[a-zA-Z_]/.test(triggerCharacter) && !triggers?.includes(triggerCharacter)) return null;
  }
  plugin.client.sync();
  const params = {
    position: plugin.toPosition(cx.pos), textDocument: { uri: plugin.uri },
    context: { triggerCharacter, triggerKind: cx.explicit ? 1 : 2 },
  };
  cx.addEventListener("abort", () => plugin.client.cancelRequest(params));
  let res: Result | Item[] | null;
  try {
    res = await plugin.client.request<object, Result | Item[] | null>("textDocument/completion", params);
  } catch (e) {
    if ((e as { code?: number } | null)?.code === -32800) return null; // cancelled
    throw e;
  }
  if (!res) return null;
  const result = Array.isArray(res) ? { items: res } : res;
  const { from, to } = replaced(cx, result);
  const defaults = result.itemDefaults?.commitCharacters;
  return {
    from, to,
    options: result.items.map((item): Completion => {
      const snippetItem = (item.insertTextFormat ?? result.itemDefaults?.insertTextFormat) === 2;
      const label = snippetItem ? item.label : textOf(item);
      const option: Completion = { label, type: item.kind ? KIND[item.kind] : undefined };
      if (item.commitCharacters && item.commitCharacters !== defaults) option.commitCharacters = item.commitCharacters;
      if (item.detail) option.detail = item.detail;
      if (item.sortText) option.sortText = item.sortText;
      if (item.documentation) {
        const doc = item.documentation;
        option.info = () => {
          const el = document.createElement("div");
          el.className = "cm-lsp-documentation cm-lsp-completion-documentation";
          el.innerHTML = plugin.docToHTML(doc);
          return el;
        };
      }
      const wanted = { ...item, insertTextFormat: snippetItem ? 2 : item.insertTextFormat };
      option.apply = (view, _c, f, t) => void apply(plugin, wanted, view, f, t);
      return option;
    }),
    commitCharacters: defaults,
    validFor: /^\w*$/,
    map: (r, changes) => ({ ...r, from: changes.mapPos(r.from) }),
  };
}

export const lspCompletion: Extension = [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: source }])];
