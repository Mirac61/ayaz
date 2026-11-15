import { backend } from "../core/backend";
import type { Transport } from "./dap";

// The "dap" stream: the first frame says which adapter (debug/adapters.ts) runs in which workspace's root, then every frame is one JSON message
// (Go adds and removes the Content-Length framing). Messages sent before the stream is open wait for it.
export function dapStream(ws: string, adapter: string): Transport {
  const sock = backend.stream("dap");
  sock.binaryType = "arraybuffer";
  const enc = new TextEncoder(), dec = new TextDecoder();
  const queue: string[] = [];
  let open = false;
  let onMessage: (json: string) => void = () => {};
  let onClose: () => void = () => {};
  sock.onopen = () => {
    open = true;
    sock.send(enc.encode(JSON.stringify({ ws, adapter })));
    for (const m of queue.splice(0)) sock.send(enc.encode(m));
  };
  sock.onmessage = (ev) => onMessage(typeof ev.data === "string" ? ev.data : dec.decode(ev.data as ArrayBuffer));
  sock.onclose = () => onClose();
  return {
    send: (json) => (open ? sock.send(enc.encode(json)) : void queue.push(json)),
    onMessage: (fn) => { onMessage = fn; },
    onClose: (fn) => { onClose = fn; },
    close: () => sock.close(),
  };
}
