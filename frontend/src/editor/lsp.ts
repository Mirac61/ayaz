// Language servers over the Wails "lsp" stream (ADR-0009): a transport adapter for @codemirror/lsp-client.
// Go frames the JSON with Content-Length, so the stream carries one bare message per frame.
import { StateEffect, StateField, type ChangeSet, type Extension, type Text } from "@codemirror/state";
import { getIndentUnit, indentUnit } from "@codemirror/language";
import { EditorView, keymap, showTooltip, type Tooltip } from "@codemirror/view";
import {
  LSPClient, LSPPlugin, Workspace, findReferencesKeymap, formatKeymap, hoverTooltips, jumpToDefinitionKeymap,
  languageServerExtensions, renameKeymap, serverDiagnostics, signatureHelp, type Transport, type WorkspaceFile,
} from "@codemirror/lsp-client";
import { backend } from "../core/backend";
import { serverFor } from "../lang/registry";
import type { Loc } from "../core/quickfix";
import { diagnosticsFor, dropDiagnostics, type Published } from "./diagnostics";
import { inlayHints } from "./inlay";
import { lspCompletion } from "./completion";
import { documentHighlight } from "./highlight";
import { SEMANTIC_CAPABILITY, semanticTokens } from "./semantic";
import { isMac } from "../core/keymap";
import { fileSettings } from "../core/settings";

const enc = new TextEncoder();
const dec = new TextDecoder();

export const fileUri = (root: string, path = "") =>
  "file://" + [...root.split("/"), ...path.split("/").filter(Boolean)].map(encodeURIComponent).join("/");

type Stream = Pick<WebSocket, "readyState" | "send" | "close" | "onopen" | "onmessage" | "onclose" | "onerror" | "binaryType">;

// Messages sent before the stream is open wait in a queue; the first frame is {ws, lang}.
// What servers are told about themselves: the inlay hints they leave off by default (shown only with
// "inlayHints" in settings.json). gopls asks through workspace/configuration, TypeScript gets didChangeConfiguration.
const GOPLS = {
  semanticTokens: true, // off by default in some versions
  hints: {
    assignVariableTypes: true, compositeLiteralFields: true, constantValues: true,
    functionTypeParameters: true, parameterNames: true, rangeVariableTypes: true,
  },
};
const TS_HINTS = {
  inlayHints: {
    includeInlayParameterNameHints: "all", includeInlayFunctionParameterTypeHints: true, includeInlayVariableTypeHints: true,
    includeInlayPropertyDeclarationTypeHints: true, includeInlayFunctionLikeReturnTypeHints: true,
    includeInlayEnumMemberValueHints: true,
  },
};
const SERVER_SETTINGS = { typescript: TS_HINTS, javascript: TS_HINTS };

// lsp-client answers every server request with "not implemented", so workspace/applyEdit (sent by commands of
// code actions) and workspace/configuration are answered here; apply resolves to whether the edit was made.
export function streamTransport(
  sock: Stream, hello: object, onClose: () => void, apply: (e: WorkspaceEdit) => Promise<boolean> = async () => false,
): Transport {
  const handlers = new Set<(m: string) => void>();
  const queue: string[] = [];
  sock.binaryType = "arraybuffer";
  sock.onopen = () => {
    sock.send(enc.encode(JSON.stringify(hello)));
    for (const m of queue.splice(0)) sock.send(enc.encode(m));
  };
  sock.onmessage = (ev) => {
    const text = typeof ev.data === "string" ? ev.data : dec.decode(ev.data as ArrayBuffer);
    const req = text.includes('"workspace/applyEdit"') || text.includes('"workspace/configuration"') ? JSON.parse(text) : null;
    const reply = (result: unknown) => sock.send(enc.encode(JSON.stringify({ jsonrpc: "2.0", id: req.id, result })));
    if (req?.method === "workspace/applyEdit" && req.id !== undefined) {
      return void apply(req.params.edit).then((applied) => reply({ applied }), () => reply({ applied: false }));
    }
    if (req?.method === "workspace/configuration" && req.id !== undefined) {
      return void reply(req.params.items.map((i: { section?: string }) => (i.section === "gopls" ? GOPLS : null)));
    }
    handlers.forEach((h) => h(text));
  };
  sock.onclose = onClose;
  return {
    send(m) {
      if (sock.readyState === WebSocket.OPEN) sock.send(enc.encode(m));
      else if (sock.readyState === WebSocket.CONNECTING) queue.push(m);
      else throw new Error("lsp stream closed");
    },
    subscribe: (h) => void handlers.add(h),
    unsubscribe: (h) => void handlers.delete(h),
  };
}

// A file URI as the shell's path: workspace-relative inside root, absolute outside (the Go stdlib and module
// cache, which Go reads only below its library roots and the editor shows read-only). null if not a file URI.
export function uriPath(root: string, uri: string): string | null {
  if (!uri.startsWith("file:///")) return null;
  const prefix = fileUri(root) + "/";
  const rel = uri.startsWith(prefix);
  return (rel ? "" : "/") + uri.slice(rel ? prefix.length : 8).split("/").map(decodeURIComponent).join("/");
}

// The shell registers how to show a file (workspace-relative path) so jumps can cross files (null if it can't),
// and how to apply a server's edit to the files.
export interface Host {
  display(path: string): Promise<EditorView | null>;
  apply(edit: WorkspaceEdit): Promise<boolean>;
}
const hosts = new Map<string, Host>();
export const setLspHost = (ws: string, h: Host) => void hosts.set(ws, h);

// window/showMessage goes to the status line instead of a banner over the code.
type Show = (text: string, level: "error" | "warning" | "info") => void;
const messages = new Map<string, Show>();
export const setLspMessages = (ws: string, f: Show) => void messages.set(ws, f);

class OpenFile implements WorkspaceFile {
  views: EditorView[] = [];
  version = 0;
  constructor(readonly uri: string, readonly languageId: string, public doc: Text) {}
  getView(main?: EditorView) { return main && this.views.includes(main) ? main : this.views[0] ?? null; }
}

// Like the default workspace, but one file may be open in several panes (splits), and jumps open files in the shell.
export class Files extends Workspace {
  files: OpenFile[] = [];
  constructor(client: LSPClient, private ws: string, private root: string) { super(client); }

  syncFiles() {
    const out: { file: OpenFile; prevDoc: Text; changes: ChangeSet }[] = [];
    for (const file of this.files) {
      // Panes of one buffer hold the same doc, so one view's changes are the file's; the others just drop theirs.
      let changes: ChangeSet | null = null;
      for (const v of file.views) {
        const plugin = LSPPlugin.get(v);
        if (!plugin) continue;
        if (!changes && !plugin.unsyncedChanges.empty) changes = plugin.unsyncedChanges;
        plugin.clear();
      }
      if (!changes) continue;
      out.push({ file, prevDoc: file.doc, changes });
      file.doc = file.views[0].state.doc;
      file.version++;
    }
    return out;
  }

  openFile(uri: string, languageId: string, view: EditorView) {
    const file = this.files.find((f) => f.uri === uri);
    if (file) return void (file.views.includes(view) || file.views.push(view));
    const f = new OpenFile(uri, languageId, view.state.doc);
    f.views.push(view);
    this.files.push(f);
    this.client.didOpen(f);
  }

  closeFile(uri: string, view: EditorView) {
    const file = this.files.find((f) => f.uri === uri);
    if (!file) return;
    file.views = file.views.filter((v) => v !== view);
    if (file.views.length) return;
    this.files = this.files.filter((f) => f !== file);
    this.client.didClose(uri);
  }

  async displayFile(uri: string) {
    const path = uriPath(this.root, uri);
    return path === null ? null : (await hosts.get(this.ws)?.display(path)) ?? null;
  }
}

interface LspRange { start: { line: number; character: number }; end: { line: number; character: number } }

// A quickfix location without its text (the caller fills it in); null for a URI that isn't a file.
function toLoc(root: string, uri: string, range: LspRange): Loc | null {
  const path = uriPath(root, uri);
  const { start, end } = range;
  if (path === null) return null;
  const len = end.line === start.line ? end.character - start.character : 0;
  return { path, line: start.line + 1, col: start.character, len, text: "" };
}

const present = (l: Loc | null): l is Loc => l !== null;

// References to the symbol at the cursor, as quickfix locations without text (the caller fills it in). null: no server.
export async function references(view: EditorView, root: string): Promise<Loc[] | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.connected) return null;
  plugin.client.sync();
  const res = await plugin.client.request<any, { uri: string; range: LspRange }[] | null>(
    "textDocument/references",
    { textDocument: { uri: plugin.uri }, position: plugin.toPosition(view.state.selection.main.head), context: { includeDeclaration: true } },
  );
  return (res ?? []).map((r) => toLoc(root, r.uri, r.range)).filter(present);
}

interface CallItem { name: string; uri: string; range: LspRange; selectionRange: LspRange }

// The callers (where they call it) or the callees (where they are defined) of the function at the cursor, as quickfix
// locations without text. null: no server; throws if the server has no call hierarchy.
export async function callHierarchy(view: EditorView, root: string, dir: "incoming" | "outgoing"): Promise<Loc[] | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.connected) return null;
  const { client } = plugin;
  if (!client.serverCapabilities?.callHierarchyProvider) throw new Error("This language server has no call hierarchy");
  client.sync();
  const items = await client.request<object, CallItem[] | null>("textDocument/prepareCallHierarchy", {
    textDocument: { uri: plugin.uri }, position: plugin.toPosition(view.state.selection.main.head),
  });
  if (!items?.length) return [];
  if (dir === "incoming") {
    const calls = await client.request<object, { from: CallItem; fromRanges: LspRange[] }[] | null>(
      "callHierarchy/incomingCalls", { item: items[0] },
    );
    return (calls ?? []).flatMap((c) => c.fromRanges.map((r) => toLoc(root, c.from.uri, r))).filter(present);
  }
  const calls = await client.request<object, { to: CallItem }[] | null>("callHierarchy/outgoingCalls", { item: items[0] });
  return (calls ?? []).map((c) => toLoc(root, c.to.uri, c.to.selectionRange)).filter(present);
}

// A symbol from documentSymbol or workspace/symbol, as a place to jump to (path as uriPath gives it).
export interface Sym { name: string; kind: number; container: string; path: string; line: number; col: number }

type Range = { start: { line: number; character: number } };
type DocSym = { name: string; kind: number; selectionRange: Range; children?: DocSym[] };
type SymInfo = { name: string; kind: number; containerName?: string; location: { uri: string; range?: Range } };

// Both result shapes as one flat list: hierarchical DocumentSymbols (children named after their parent) or SymbolInformation.
export function flatSymbols(res: (DocSym | SymInfo)[] | null, root: string, path: string): Sym[] {
  const out: Sym[] = [];
  const walk = (s: DocSym | SymInfo, container: string) => {
    if ("location" in s) {
      const p = uriPath(root, s.location.uri);
      const at = s.location.range?.start ?? { line: 0, character: 0 }; // WorkspaceSymbol may come without a range
      if (p !== null) out.push({ name: s.name, kind: s.kind, container: s.containerName ?? "", path: p, line: at.line + 1, col: at.character });
      return;
    }
    const at = s.selectionRange.start;
    out.push({ name: s.name, kind: s.kind, container, path, line: at.line + 1, col: at.character });
    for (const c of s.children ?? []) walk(c, s.name);
  };
  for (const s of res ?? []) walk(s, "");
  return out;
}

export const hasLsp = (view: EditorView) => !!LSPPlugin.get(view)?.client.connected;

type Position = { line: number; character: number };
type TextEdit = { range: { start: Position; end: Position }; newText: string };
type ResourceOp = { kind: "create" | "delete"; uri: string } | { kind: "rename"; oldUri: string; newUri: string };
export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: ({ textDocument: { uri: string }; edits: TextEdit[] } | ResourceOp)[];
}

export type FileOp =
  | { kind: "edit"; path: string; edits: TextEdit[] }
  | { kind: "create"; path: string }
  | { kind: "delete"; path: string }
  | { kind: "rename"; from: string; to: string };

// The edit as steps in order, paths as uriPath gives them. Files are only created, renamed or deleted
// inside the folder (a relative path): a server can't touch anything else.
export function fileOps(root: string, edit: WorkspaceEdit): FileOp[] {
  const textEdit = (uri: string, edits: TextEdit[]): FileOp[] => {
    const path = uriPath(root, uri);
    return path === null || !edits.length ? [] : [{ kind: "edit", path, edits }];
  };
  const inside = (uri: string) => {
    const p = uriPath(root, uri);
    return p === null || p.startsWith("/") ? null : p;
  };
  if (!edit.documentChanges) return Object.entries(edit.changes ?? {}).flatMap(([uri, edits]) => textEdit(uri, edits));
  return edit.documentChanges.flatMap((c): FileOp[] => {
    if ("textDocument" in c) return textEdit(c.textDocument.uri, c.edits);
    if (c.kind === "rename") {
      const from = inside(c.oldUri), to = inside(c.newUri);
      return from === null || to === null ? [] : [{ kind: "rename", from, to }];
    }
    const path = inside(c.uri);
    return path === null ? [] : [{ kind: c.kind, path }];
  });
}

// LSP edits as changes to doc, in order. Both count characters in UTF-16 units.
export function toChanges(doc: Text, edits: TextEdit[]) {
  const at = (p: Position) => {
    if (p.line >= doc.lines) return doc.length;
    const l = doc.line(p.line + 1);
    return Math.min(l.from + p.character, l.to);
  };
  return edits.map((e) => ({ from: at(e.range.start), to: at(e.range.end), insert: e.newText })).sort((a, b) => a.from - b.from);
}

// The rename of the symbol at the cursor; null: no server.
export async function renameAt(view: EditorView, newName: string): Promise<WorkspaceEdit | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.connected) return null;
  plugin.client.sync();
  const pos = plugin.toPosition(view.state.selection.main.head);
  return (await plugin.client.request<any, WorkspaceEdit | null>("textDocument/rename", { textDocument: { uri: plugin.uri }, position: pos, newName })) ?? {};
}

type Command = { title: string; command: string; arguments?: unknown[] };
export type CodeAction = { title: string; kind?: string; edit?: WorkspaceEdit; command?: Command; data?: unknown };

// Code actions for the selection (the cursor in normal mode), with the diagnostics on its lines so quick fixes come too.
// A bare Command comes back as an action that only runs it. null: no server.
export async function codeActions(view: EditorView, ws: string): Promise<CodeAction[] | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.connected) return null;
  plugin.client.sync();
  const { from, to } = view.state.selection.main;
  const range = { start: plugin.toPosition(from), end: plugin.toPosition(to) };
  const diagnostics = diagnosticsFor(ws).forUri(plugin.uri)
    .filter((d) => d.line >= range.start.line && d.line <= range.end.line).map((d) => d.raw);
  const res = await plugin.client.request<any, (CodeAction | Command)[] | null>("textDocument/codeAction", {
    textDocument: { uri: plugin.uri }, range, context: { diagnostics },
  });
  return (res ?? []).map((a) => (typeof a.command === "string" ? { title: a.title, command: a as Command } : a as CodeAction));
}

// Servers that work out an action's edit only when it is picked (TypeScript's refactors) send it without one:
// codeAction/resolve fills it in. Actions that have their edit, or servers that can't resolve, stay as they are.
export async function resolveAction(view: EditorView, a: CodeAction): Promise<CodeAction> {
  const client = LSPPlugin.get(view)?.client;
  const provider = client?.serverCapabilities?.codeActionProvider;
  if (a.edit || !client || typeof provider !== "object" || !provider.resolveProvider) return a;
  return (await client.request<CodeAction, CodeAction | null>("codeAction/resolve", a)) ?? a;
}

// Runs an action's command on the server; its edits come back through workspace/applyEdit.
export async function runCommand(view: EditorView, c: Command) {
  await LSPPlugin.get(view)?.client.request("workspace/executeCommand", { command: c.command, arguments: c.arguments });
}

// K: the server's hover text at the cursor, as a tooltip until the cursor moves, the text changes or Esc.
const setHover = StateEffect.define<Tooltip | null>();
const hoverField = StateField.define<Tooltip | null>({
  create: () => null,
  update(t, tr) {
    for (const e of tr.effects) if (e.is(setHover)) return e.value;
    return tr.docChanged || tr.selection ? null : t;
  },
  provide: (f) => showTooltip.from(f),
});
const hoverEsc = EditorView.domEventHandlers({
  keydown(e, view) {
    if (e.key === "Escape" && view.state.field(hoverField, false)) view.dispatch({ effects: setHover.of(null) });
    return false;
  },
});

type Marked = string | { language: string; value: string } | { kind: string; value: string };

// Resolves to false when the server has nothing to show, null without a server.
export async function showHover(view: EditorView): Promise<boolean | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.connected) return null;
  plugin.client.sync();
  const pos = view.state.selection.main.head;
  const res = await plugin.client.request<any, { contents: Marked | Marked[] } | null>("textDocument/hover", {
    textDocument: { uri: plugin.uri }, position: plugin.toPosition(pos),
  });
  const html = (c: Marked | Marked[]): string => {
    if (Array.isArray(c)) return c.map(html).join("");
    if (typeof c === "string") return plugin.docToHTML(c, "markdown");
    return "kind" in c ? plugin.docToHTML(c as { kind: "markdown" | "plaintext"; value: string }) : plugin.docToHTML("```" + c.language + "\n" + c.value + "\n```", "markdown");
  };
  const body = res && html(res.contents);
  if (!body?.trim()) return false;
  const tip: Tooltip = {
    pos,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "cm-lsp-hover-tooltip cm-lsp-documentation";
      dom.innerHTML = body;
      return { dom };
    },
  };
  if (view.state.selection.main.head === pos) view.dispatch({ effects: setHover.of(tip) });
  return true;
}

// The symbols of the view's file; null: no server.
export async function documentSymbols(view: EditorView, root: string): Promise<Sym[] | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.connected) return null;
  plugin.client.sync();
  const res = await plugin.client.request<any, (DocSym | SymInfo)[] | null>("textDocument/documentSymbol", { textDocument: { uri: plugin.uri } });
  return flatSymbols(res, root, uriPath(root, plugin.uri) ?? "");
}

// Symbols matching query across the project (and what the server adds, like the stdlib); null: no server.
export async function workspaceSymbols(view: EditorView, root: string, query: string): Promise<Sym[] | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.connected) return null;
  const res = await plugin.client.request<any, SymInfo[] | null>("workspace/symbol", { query });
  return flatSymbols(res, root, "");
}

// Formats the document through the server and waits for it; gives up after 2 s so a hung server can't block saving.
export async function formatBeforeSave(view: EditorView): Promise<void> {
  const plugin = LSPPlugin.get(view);
  // Q25: per language in settings.json, on for Go only by default.
  if (!plugin?.client.connected || view.state.readOnly || !fileSettings(plugin.uri).formatOnSave) return;
  const { client, uri } = plugin;
  client.sync();
  const job = client.withMapping(async (mapping) => {
    const edits = await client.request<any, { range: { start: any; end: any }; newText: string }[] | null>("textDocument/formatting", {
      textDocument: { uri },
      options: { tabSize: getIndentUnit(view.state), insertSpaces: !view.state.facet(indentUnit).includes("\t") },
    });
    if (!edits?.length) return;
    const changed = mapping.getMapping(uri);
    const changes: { from: number; to: number; insert: string }[] = [];
    for (const e of edits) {
      let from = mapping.mapPosition(uri, e.range.start), to = mapping.mapPosition(uri, e.range.end);
      if (changed) {
        if (changed.touchesRange(from, to)) return; // edited meanwhile: skip rather than clobber
        from = changed.mapPos(from, 1);
        to = changed.mapPos(to, -1);
      }
      changes.push({ from, to, insert: e.newText });
    }
    view.dispatch({ changes, userEvent: "format" });
  });
  await Promise.race([job.catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
}

const missing = new Set<string>(); // "ws:server" whose server isn't installed or whose workspace closed: don't retry

// How to get each server, for the message when it is missing.
const INSTALL: Record<string, string> = {
  gopls: "go install golang.org/x/tools/gopls@latest",
  clangd: isMac ? "xcode-select --install, or brew install llvm" : "install clangd with your package manager",
  ts: "npm i -g typescript-language-server typescript",
  html: "npm i -g vscode-langservers-extracted",
  css: "npm i -g vscode-langservers-extracted",
  json: "npm i -g vscode-langservers-extracted",
  jdtls: isMac ? "brew install jdtls" : "install jdtls with your package manager",
  pyright: "npm i -g pyright",
  "rust-analyzer": "rustup component add rust-analyzer",
  yaml: "npm i -g yaml-language-server",
  taplo: "cargo install taplo-cli --locked --features lsp",
  tinymist: "brew install tinymist",
  texlab: "brew install texlab",
  dlv: "go install github.com/go-delve/delve/cmd/dlv@latest", // the debugger, through the same "missing" status
};
export const installHint = (server: string) => INSTALL[server] ?? "";

// Why a file has no language features, for the status line.
export function noServer(ws: string, path: string | undefined): string {
  const server = path && serverFor(path)?.[1];
  if (!server) return "No language server for this file type";
  if (missing.has(`${ws}:${server}`)) return `${server} is not installed: ${INSTALL[server]}`;
  return `${server} is still starting`;
}
const sockets = new Map<string, WebSocket>();
const MAX_RETRIES = 5; // a missing server ends the stream at once; stop asking after this many tries in a row
const clients = new Map<string, LSPClient>();

// Keeps every file's diagnostics for the list and the status line; false lets serverDiagnostics underline them too.
export const diagnosticHandlers = (ws: string, server = "") => ({
  "textDocument/publishDiagnostics": (_c: LSPClient, p: Published) => {
    diagnosticsFor(ws).publish(p, server);
    return false;
  },
  // type 1 error, 2 warning, 3 info, 4 log (dropped, like the library does)
  "window/showMessage": (_c: LSPClient, p: { type: number; message: string }) => {
    const show = messages.get(ws);
    if (show && p.type <= 3) show(`${server}: ${p.message}`, p.type === 1 ? "error" : p.type === 2 ? "warning" : "info");
    return !!show;
  },
});

// Code actions as literals (title + edit), and server commands may send edits back (workspace/applyEdit).
export const CAPABILITIES = {
  workspace: {
    applyEdit: true, configuration: true,
    workspaceEdit: { documentChanges: true, resourceOperations: ["create", "rename", "delete"] },
  },
  textDocument: {
    inlayHint: {},
    semanticTokens: SEMANTIC_CAPABILITY,
    selectionRange: {},
    documentHighlight: {},
    completion: { completionItem: { resolveSupport: { properties: ["additionalTextEdits"] } } },
    callHierarchy: {},
    codeAction: {
      dataSupport: true,
      resolveSupport: { properties: ["edit"] },
      codeActionLiteralSupport: {
        codeActionKind: { valueSet: ["", "quickfix", "refactor", "refactor.extract", "refactor.inline", "refactor.rewrite", "source", "source.organizeImports"] },
      },
    },
  },
};

// What languageServerExtensions() bundles, with our completion source in place of the library's (see completion.ts).
export const clientExtensions = (): ReturnType<typeof languageServerExtensions> => [
  lspCompletion,
  hoverTooltips(),
  keymap.of([...formatKeymap, ...renameKeymap, ...jumpToDefinitionKeymap, ...findReferencesKeymap]),
  signatureHelp(),
  serverDiagnostics(),
];

// One client per (workspace, server), shared by every file it serves.
function clientFor(ws: string, root: string, server: string): LSPClient {
  const key = `${ws}:${server}`;
  let client = clients.get(key);
  if (client) return client;
  client = new LSPClient({
    rootUri: fileUri(root),
    extensions: [...clientExtensions(), { clientCapabilities: CAPABILITIES }],
    workspace: (c) => new Files(c, ws, root),
    notificationHandlers: diagnosticHandlers(ws, server),
    // The default 3 s also bounds initialize, whose clock starts before Go has spawned the server: a cold
    // clangd (xcrun) or jdtls took longer, and the reply that came after the timeout was dropped.
    timeout: 30_000,
  });
  backend.onLspStatus(ws, (s) => s.lang === server && s.state === "missing" && missing.add(key));
  clients.set(key, client);
  let failures = 0;
  const c = client;
  const connect = () => {
    const sock = backend.stream("lsp");
    sockets.set(key, sock);
    const transport = streamTransport(sock, { ws, lang: server }, () => {
      c.disconnect();
      if (missing.has(key) || ++failures > MAX_RETRIES) return;
      setTimeout(connect, Math.min(30_000, 500 * 2 ** failures)); // backoff: 1 s, 2 s, 4 s ...
    }, async (e) => (await hosts.get(ws)?.apply(e)) ?? false);
    c.connect(transport);
    c.initializing.then(() => {
      failures = 0;
      c.notification("workspace/didChangeConfiguration", { settings: SERVER_SETTINGS });
    }, () => sock.close()); // a failed initialize leaves the client dead: closing reconnects with the backoff above
  };
  connect();
  return client;
}

// Stops the workspace's clients for good: switching folders or closing it (Go stops the servers too).
export function closeLsp(ws: string) {
  for (const [key, client] of clients) {
    if (!key.startsWith(`${ws}:`)) continue;
    missing.add(key);
    client.disconnect();
    sockets.get(key)?.close();
    sockets.delete(key);
    clients.delete(key);
  }
  hosts.delete(ws);
  messages.delete(ws);
  dropDiagnostics(ws);
}

// The extension for one file, or none when its language has no server.
export function lspExtension(ws: string, root: string, path: string): Extension {
  const s = serverFor(path);
  if (!s) return [];
  const uri = path.startsWith("/") ? fileUri(path) : fileUri(root, path);
  return [clientFor(ws, root, s[1]).plugin(uri, s[0]), hoverField, hoverEsc, inlayHints, semanticTokens, documentHighlight];
}
