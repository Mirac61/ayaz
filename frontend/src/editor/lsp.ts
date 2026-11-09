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

// Extension → LSP language ID. Servers are chosen in Go (app/lsp.go); only Go until M9.
const LANG: Record<string, string> = { go: "go" };

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

// Formats the document through the server and waits for it; gives up after 2 s so a hung server can't block saving.
export async function formatBeforeSave(view: EditorView): Promise<void> {
  const plugin = LSPPlugin.get(view);
  if (!plugin?.client.connected || view.state.readOnly) return;
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

const missing = new Set<string>(); // "ws:lang" whose server isn't installed: don't retry
const MAX_RETRIES = 5; // a missing server ends the stream at once; stop asking after this many tries in a row
const clients = new Map<string, LSPClient>();

// One client per (workspace, language), shared by every file of that language.
function clientFor(ws: string, root: string, lang: string): LSPClient {
  const key = `${ws}:${lang}`;
  let client = clients.get(key);
  if (client) return client;
  client = new LSPClient({
    rootUri: fileUri(root),
    extensions: languageServerExtensions(),
    workspace: (c) => new Files(c, ws, root),
  });
  backend.onLspStatus(ws, (s) => s.lang === lang && s.state === "missing" && missing.add(key));
  clients.set(key, client);
  let failures = 0;
  const c = client;
  const connect = () => {
    const transport = streamTransport(backend.stream("lsp"), { ws, lang }, () => {
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

// The extension for one file, or none when its language has no server.
export function lspExtension(ws: string, root: string, path: string): Extension {
  const lang = LANG[extOf(path)];
  return lang ? clientFor(ws, root, lang).plugin(path.startsWith("/") ? fileUri(path) : fileUri(root, path), lang) : [];
}
