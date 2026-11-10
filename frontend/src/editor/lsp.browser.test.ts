import { afterEach, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LSPClient, languageServerExtensions, type Transport } from "@codemirror/lsp-client";
import { editorExtensions } from "./editor";
import { Files, diagnosticHandlers, documentSymbols, formatBeforeSave, resolveAction, workspaceSymbols } from "./lsp";
import { diagnosticsFor } from "./diagnostics";

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

test("the diagnostics store sees what the server publishes, and the underline stays", async () => {
  const client = new LSPClient({ rootUri: "file:///r", extensions: languageServerExtensions(), notificationHandlers: diagnosticHandlers("dw") })
    .connect(fakeServer());
  await client.initializing;
  const el = document.createElement("div");
  document.body.append(el);
  view = new EditorView({
    parent: el,
    state: EditorState.create({ doc: "bad word", extensions: [editorExtensions(), client.plugin("file:///r/a.go", "go")] }),
  });
  await expect.poll(() => el.querySelector(".cm-lintRange-error")).not.toBeNull();
  expect(diagnosticsFor("dw").counts()).toEqual({ errors: 1, warnings: 0 });
});

// Records what the client tells the server, answers formatting with one edit.
function recordingServer() {
  const sent: any[] = [];
  const handlers = new Set<(m: string) => void>();
  const reply = (o: object) => queueMicrotask(() => handlers.forEach((h) => h(JSON.stringify({ jsonrpc: "2.0", ...o }))));
  const t: Transport = {
    send(raw) {
      const m = JSON.parse(raw);
      sent.push(m);
      if (m.method === "initialize") reply({ id: m.id, result: { capabilities: { textDocumentSync: 1, documentFormattingProvider: true } } });
      else if (m.method === "textDocument/formatting")
        reply({ id: m.id, result: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: "X" }] });
    },
    subscribe: (h) => void handlers.add(h),
    unsubscribe: (h) => void handlers.delete(h),
  };
  return { t, sent };
}

test("one file in two panes opens once, closes after the last view", async () => {
  const { t, sent } = recordingServer();
  const client = new LSPClient({ rootUri: "file:///r", extensions: languageServerExtensions(), workspace: (c) => new Files(c, "w", "/r") }).connect(t);
  await client.initializing;
  const mk = () => {
    const el = document.createElement("div");
    document.body.append(el);
    return new EditorView({ parent: el, state: EditorState.create({ doc: "abc", extensions: [client.plugin("file:///r/a.go", "go")] }) });
  };
  const a = mk(), b = mk();
  const count = (m: string) => sent.filter((x) => x.method === m).length;
  await expect.poll(() => count("textDocument/didOpen")).toBe(1);
  a.destroy();
  await new Promise((r) => setTimeout(r, 100));
  expect(count("textDocument/didClose")).toBe(0);
  b.destroy();
  await expect.poll(() => count("textDocument/didClose")).toBe(1);
});

test("formatBeforeSave applies the server's edits", async () => {
  const { t } = recordingServer();
  const client = new LSPClient({ rootUri: "file:///r", workspace: (c) => new Files(c, "w", "/r") }).connect(t);
  await client.initializing;
  const el = document.createElement("div");
  document.body.append(el);
  view = new EditorView({ parent: el, state: EditorState.create({ doc: "abc", extensions: [client.plugin("file:///r/a.go", "go")] }) });
  await formatBeforeSave(view);
  expect(view.state.doc.toString()).toBe("Xbc");
});

test("document symbols flatten with their container, workspace symbols map URIs to paths", async () => {
  const handlers = new Set<(m: string) => void>();
  const reply = (o: object) => queueMicrotask(() => handlers.forEach((h) => h(JSON.stringify({ jsonrpc: "2.0", ...o }))));
  const pos = (line: number, character: number) => ({ start: { line, character }, end: { line, character } });
  const t: Transport = {
    send(raw) {
      const m = JSON.parse(raw);
      if (m.method === "initialize") reply({ id: m.id, result: { capabilities: { textDocumentSync: 1 } } });
      else if (m.method === "textDocument/documentSymbol")
        reply({ id: m.id, result: [{ name: "T", kind: 23, range: pos(0, 0), selectionRange: pos(0, 5), children: [{ name: "f", kind: 8, range: pos(1, 1), selectionRange: pos(1, 1) }] }] });
      else if (m.method === "workspace/symbol")
        reply({ id: m.id, result: [
          { name: "hello", kind: 12, location: { uri: "file:///r/sub/a.go", range: pos(3, 5) } },
          { name: "Println", kind: 12, containerName: "fmt", location: { uri: "file:///go/fmt/print.go", range: pos(9, 5) } },
        ] });
    },
    subscribe: (h) => void handlers.add(h),
    unsubscribe: (h) => void handlers.delete(h),
  };
  const client = new LSPClient({ rootUri: "file:///r", workspace: (c) => new Files(c, "w", "/r") }).connect(t);
  await client.initializing;
  const el = document.createElement("div");
  document.body.append(el);
  view = new EditorView({ parent: el, state: EditorState.create({ doc: "abc", extensions: [client.plugin("file:///r/a.go", "go")] }) });
  expect(await documentSymbols(view, "/r")).toEqual([
    { name: "T", kind: 23, container: "", path: "a.go", line: 1, col: 5 },
    { name: "f", kind: 8, container: "T", path: "a.go", line: 2, col: 1 },
  ]);
  expect(await workspaceSymbols(view, "/r", "h")).toEqual([
    { name: "hello", kind: 12, container: "", path: "sub/a.go", line: 4, col: 5 },
    { name: "Println", kind: 12, container: "fmt", path: "/go/fmt/print.go", line: 10, col: 5 },
  ]);
});

// M44: an action that comes without its edit gets it through codeAction/resolve before it runs.
test("resolveAction fills in the edit when the server resolves", async () => {
  const handlers = new Set<(m: string) => void>();
  const reply = (o: object) => queueMicrotask(() => handlers.forEach((h) => h(JSON.stringify({ jsonrpc: "2.0", ...o }))));
  const edit = { changes: { "file:///r/a.ts": [] } };
  const t: Transport = {
    send(raw) {
      const m = JSON.parse(raw);
      const caps = { textDocumentSync: 1, codeActionProvider: { resolveProvider: true } };
      if (m.method === "initialize") reply({ id: m.id, result: { capabilities: caps } });
      else if (m.method === "codeAction/resolve") reply({ id: m.id, result: { ...m.params, edit } });
    },
    subscribe: (h) => void handlers.add(h),
    unsubscribe: (h) => void handlers.delete(h),
  };
  const client = new LSPClient({ rootUri: "file:///r", workspace: (c) => new Files(c, "w", "/r") }).connect(t);
  await client.initializing;
  view = new EditorView({ state: EditorState.create({ doc: "x", extensions: [editorExtensions(), client.plugin("file:///r/a.ts", "typescript")] }) });
  expect(await resolveAction(view, { title: "Move", data: 1 })).toEqual({ title: "Move", data: 1, edit });
  const done = { title: "Has it", edit };
  expect(await resolveAction(view, done)).toBe(done);
});
