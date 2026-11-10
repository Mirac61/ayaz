import { afterEach, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { acceptCompletion, completionStatus, startCompletion } from "@codemirror/autocomplete";
import { LSPClient, type Transport } from "@codemirror/lsp-client";
import { editorExtensions } from "./editor";
import { loadSnippets, snippetsError } from "../core/snippets";
import { snippetCompletion } from "./snippets";
import { CAPABILITIES, clientExtensions } from "./lsp";

let view: EditorView | null = null;
afterEach(() => {
  const box = view?.dom.parentElement;
  view?.destroy();
  box?.remove();
  view = null;
});

const range = (l1: number, c1: number, l2: number, c2: number) => (
  { start: { line: l1, character: c1 }, end: { line: l2, character: c2 } }
);

// A server with one completion item (what the test passes), optionally with a resolve step.
async function mount(doc: string, item: object, resolved?: object) {
  const handlers = new Set<(m: string) => void>();
  const reply = (o: object) => queueMicrotask(() => handlers.forEach((h) => h(JSON.stringify({ jsonrpc: "2.0", ...o }))));
  const transport: Transport = {
    send(raw) {
      const m = JSON.parse(raw);
      if (m.method === "initialize") {
        const completionProvider = { resolveProvider: !!resolved };
        reply({ id: m.id, result: { capabilities: { textDocumentSync: 1, completionProvider } } });
      } else if (m.method === "textDocument/completion") reply({ id: m.id, result: [item] });
      else if (m.method === "completionItem/resolve") reply({ id: m.id, result: resolved });
    },
    subscribe: (h) => void handlers.add(h),
    unsubscribe: (h) => void handlers.delete(h),
  };
  const client = new LSPClient({
    rootUri: "file:///r", extensions: [...clientExtensions(), { clientCapabilities: CAPABILITIES }],
  }).connect(transport);
  await client.initializing;
  const el = document.createElement("div");
  document.body.append(el);
  view = new EditorView({
    parent: el,
    state: EditorState.create({
      doc, selection: { anchor: doc.length }, extensions: [editorExtensions(), client.plugin("file:///r/a.go", "go")],
    }),
  });
  view.focus();
  startCompletion(view);
  await expect.poll(() => completionStatus(view!.state)).toBe("active");
  await new Promise((r) => setTimeout(r, 120)); // an accept right after the popup opens is ignored (interactionDelay)
  return view;
}

const SRC = "package main\n\nfunc f() {\n\tfmt.Pri";
const IMPORT = { range: range(1, 0, 1, 0), newText: 'import "fmt"\n' };

test("a completion's additionalTextEdits go in with it: the import comes with fmt.Println", async () => {
  const v = await mount(SRC, {
    label: "Println", insertText: "Println", additionalTextEdits: [IMPORT],
    textEdit: { range: range(3, 5, 3, 8), newText: "Println" },
  });
  expect(acceptCompletion(v)).toBe(true);
  expect(v.state.doc.toString()).toBe('package main\nimport "fmt"\n\nfunc f() {\n\tfmt.Println');
  expect(v.state.selection.main.head).toBe(v.state.doc.length);
});

test("an item without them is resolved when the server can", async () => {
  const v = await mount(
    SRC,
    { label: "Println", textEdit: { range: range(3, 5, 3, 8), newText: "Println" } },
    { label: "Println", additionalTextEdits: [IMPORT] },
  );
  acceptCompletion(v);
  await expect.poll(() => v.state.doc.toString()).toBe('package main\nimport "fmt"\n\nfunc f() {\n\tfmt.Println');
});

test("a snippet inserts its text with tab stops, and the extra edits still apply", async () => {
  const v = await mount(SRC, {
    label: "Printf", insertTextFormat: 2, textEdit: { range: range(3, 5, 3, 8), newText: "Printf(${1:format}, $2)$0" },
    additionalTextEdits: [IMPORT],
  });
  acceptCompletion(v);
  expect(v.state.doc.toString()).toBe('package main\nimport "fmt"\n\nfunc f() {\n\tfmt.Printf(format, )');
  expect(v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to)).toBe("format"); // first stop selected
});

test("a plain item replaces the typed word and nothing else changes", async () => {
  const v = await mount("x := fo", { label: "foo", textEdit: { range: range(0, 5, 0, 7), newText: "foo" } });
  acceptCompletion(v);
  expect(v.state.doc.toString()).toBe("x := foo");
});

test("snippets.json: a snippet shows up in the list and inserts with its tab stops; a new file applies at once", async () => {
  const body = '["if err != nil {", "\\treturn ${1:err}", "}", "$0"]';
  loadSnippets(`{ "go": { "iferr": { "prefix": "iferr", "body": ${body}, "description": "return it" } } }`);
  expect(snippetsError()).toBe("");
  const el = document.createElement("div");
  document.body.append(el);
  view = new EditorView({
    parent: el,
    state: EditorState.create({
      doc: "func f() {\n\tife", selection: { anchor: 15 }, extensions: [editorExtensions(), snippetCompletion("go")],
    }),
  });
  view.focus();
  startCompletion(view);
  await expect.poll(() => completionStatus(view!.state)).toBe("active");
  await new Promise((r) => setTimeout(r, 120));
  acceptCompletion(view);
  // the body's tab becomes the editor's indent unit (two spaces in this test)
  expect(view.state.doc.toString()).toBe("func f() {\n\tif err != nil {\n\t  return err\n\t}\n\t"); // $0 sits on its own line
  expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe("err");

  loadSnippets("{}"); // saved without it: the next completion has nothing
  view.dispatch({ changes: { from: view.state.doc.length, insert: "ife" }, selection: { anchor: view.state.doc.length + 3 } });
  startCompletion(view);
  await new Promise((r) => setTimeout(r, 200));
  expect(completionStatus(view.state)).toBe(null);
  loadSnippets("");
});
