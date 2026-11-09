// Language servers over the Wails "lsp" stream (ADR-0009): a transport adapter for @codemirror/lsp-client.
// Go frames the JSON with Content-Length, so the stream carries one bare message per frame.
import type { ChangeSet, Extension, Text } from "@codemirror/state";
import { getIndentUnit, indentUnit } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import {
  LSPClient, LSPPlugin, Workspace, languageServerExtensions,
  type Transport, type WorkspaceFile,
} from "@codemirror/lsp-client";
import { backend } from "../core/backend";
import { extOf } from "../lang/registry";
import type { Loc } from "../core/quickfix";

// Extension → [LSP language ID, server name]. Go maps the server name to a command (app/lsp.go);
// one server per (workspace, server), so .c and .cpp share clangd, .ts and .js share one TypeScript server.
const LANG: Record<string, [string, string]> = {
  go: ["go", "gopls"],
  c: ["c", "clangd"], h: ["c", "clangd"], cc: ["cpp", "clangd"], cpp: ["cpp", "clangd"], hpp: ["cpp", "clangd"],
  js: ["javascript", "ts"], mjs: ["javascript", "ts"], jsx: ["javascriptreact", "ts"],
  ts: ["typescript", "ts"], tsx: ["typescriptreact", "ts"],
  html: ["html", "html"], css: ["css", "css"], json: ["json", "json"],
  java: ["java", "jdtls"],
};
export const serverFor = (path: string): [lang: string, server: string] | undefined => LANG[extOf(path)];

// Q25: format on save per language, on for Go only by default.
const FORMAT_ON_SAVE = new Set(["go"]);

const enc = new TextEncoder();
const dec = new TextDecoder();

export const fileUri = (root: string, path = "") =>
  "file://" + [...root.split("/"), ...path.split("/").filter(Boolean)].map(encodeURIComponent).join("/");

type Stream = Pick<WebSocket, "readyState" | "send" | "close" | "onopen" | "onmessage" | "onclose" | "onerror" | "binaryType">;

// Messages sent before the stream is open wait in a queue; the first frame is {ws, lang}.
export function streamTransport(sock: Stream, hello: object, onClose: () => void): Transport {
  const handlers = new Set<(m: string) => void>();
  const queue: string[] = [];
  sock.binaryType = "arraybuffer";
  sock.onopen = () => {
    sock.send(enc.encode(JSON.stringify(hello)));
    for (const m of queue.splice(0)) sock.send(enc.encode(m));
  };
  sock.onmessage = (ev) => {
    const text = typeof ev.data === "string" ? ev.data : dec.decode(ev.data as ArrayBuffer);
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

// The shell registers how to show a file (workspace-relative path) so jumps can cross files; null if it can't.
export type Host = (path: string) => Promise<EditorView | null>;
const hosts = new Map<string, Host>();
export const setLspHost = (ws: string, h: Host) => void hosts.set(ws, h);

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
    return path === null ? null : (await hosts.get(this.ws)?.(path)) ?? null;
  }
}

// References to the symbol at the cursor, as quickfix locations without text (the caller fills it in). null: no server.
export async function references(view: EditorView, root: string): Promise<Loc[] | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.connected) return null;
  plugin.client.sync();
  const res = await plugin.client.request<any, { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }[] | null>(
    "textDocument/references",
    { textDocument: { uri: plugin.uri }, position: plugin.toPosition(view.state.selection.main.head), context: { includeDeclaration: true } },
  );
  return (res ?? []).flatMap((r) => {
    const path = uriPath(root, r.uri);
    const { start, end } = r.range;
    return path === null ? [] : [{ path, line: start.line + 1, col: start.character, len: end.line === start.line ? end.character - start.character : 0, text: "" }];
  });
}

// Formats the document through the server and waits for it; gives up after 2 s so a hung server can't block saving.
export async function formatBeforeSave(view: EditorView): Promise<void> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.connected || view.state.readOnly || !FORMAT_ON_SAVE.has(serverFor(plugin.uri)?.[0] ?? "")) return;
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
const sockets = new Map<string, WebSocket>();
const MAX_RETRIES = 5; // a missing server ends the stream at once; stop asking after this many tries in a row
const clients = new Map<string, LSPClient>();

// One client per (workspace, server), shared by every file it serves.
function clientFor(ws: string, root: string, server: string): LSPClient {
  const key = `${ws}:${server}`;
  let client = clients.get(key);
  if (client) return client;
  client = new LSPClient({
    rootUri: fileUri(root),
    extensions: languageServerExtensions(),
    workspace: (c) => new Files(c, ws, root),
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
    });
    c.connect(transport);
    c.initializing.then(() => (failures = 0), () => {});
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
}

// The extension for one file, or none when its language has no server.
export function lspExtension(ws: string, root: string, path: string): Extension {
  const s = serverFor(path);
  return s ? clientFor(ws, root, s[1]).plugin(path.startsWith("/") ? fileUri(path) : fileUri(root, path), s[0]) : [];
}
