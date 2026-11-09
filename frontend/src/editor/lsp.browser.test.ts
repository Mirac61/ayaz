import { afterEach, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LSPClient, languageServerExtensions, type Transport } from "@codemirror/lsp-client";
import { editorExtensions } from "./editor";

// A fake language server: answers initialize, flags "bad" on didOpen, offers one completion.
function fakeServer(): Transport {
  const handlers = new Set<(m: string) => void>();
  const reply = (o: object) => queueMicrotask(() => handlers.forEach((h) => h(JSON.stringify({ jsonrpc: "2.0", ...o }))));
  return {
    send(raw) {
      const m = JSON.parse(raw);
      if (m.method === "initialize") reply({ id: m.id, result: { capabilities: { textDocumentSync: 1, completionProvider: {} } } });
      else if (m.method === "textDocument/completion") reply({ id: m.id, result: [{ label: "fmt.Println" }] });
      else if (m.method === "textDocument/didOpen")
        reply({
          method: "textDocument/publishDiagnostics",
          params: { uri: m.params.textDocument.uri, diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, severity: 1, message: "bad word" }] },
        });
    },
    subscribe: (h) => void handlers.add(h),
    unsubscribe: (h) => void handlers.delete(h),
  };
}

let view: EditorView | null = null;
afterEach(() => { view?.destroy(); view = null; });

test("a server diagnostic shows as a lint marker", async () => {
  const client = new LSPClient({ rootUri: "file:///r", extensions: languageServerExtensions() }).connect(fakeServer());
  await client.initializing;
  const el = document.createElement("div");
  document.body.append(el);
  view = new EditorView({
    parent: el,
    state: EditorState.create({ doc: "bad word", extensions: [editorExtensions(), client.plugin("file:///r/a.go", "go")] }),
  });
  await expect.poll(() => el.querySelector(".cm-lintRange-error")).not.toBeNull();
});
