// Language servers over the Wails "lsp" stream (ADR-0009): a transport adapter for @codemirror/lsp-client.
// Go frames the JSON with Content-Length, so the stream carries one bare message per frame.
import type { Extension } from "@codemirror/state";
import { LSPClient, languageServerExtensions, type Transport } from "@codemirror/lsp-client";
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

const MAX_RETRIES = 5; // a missing server ends the stream at once; stop asking after this many tries in a row
const clients = new Map<string, LSPClient>();

// One client per (workspace, language), shared by every file of that language.
function clientFor(ws: string, root: string, lang: string): LSPClient {
  const key = `${ws}:${lang}`;
  let client = clients.get(key);
  if (client) return client;
  client = new LSPClient({ rootUri: fileUri(root), extensions: languageServerExtensions() });
  clients.set(key, client);
  let failures = 0;
  const c = client;
  const connect = () => {
    const transport = streamTransport(backend.stream("lsp"), { ws, lang }, () => {
      c.disconnect();
      if (++failures > MAX_RETRIES) return;
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
  return lang ? clientFor(ws, root, lang).plugin(fileUri(root, path), lang) : [];
}
