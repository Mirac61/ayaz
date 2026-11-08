// xterm.js on a Wails "pty" stream (ADR-0013). Becomes the terminal provider in M4.
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { backend } from "../core/backend";
import { kanagawaTerm } from "../theme/kanagawa-term";

export interface TermOptions {
  renderer: "dom" | "webgl";
  windowMs?: number; // batching knobs, Spike S6
  maxBytes?: number;
}

export interface TermHandle {
  term: Terminal;
  ws: WebSocket;
  input(data: string): void;
  dispose(): void;
}

const enc = new TextEncoder();
const frame = (kind: number, body: Uint8Array) => {
  const f = new Uint8Array(body.length + 1);
  f[0] = kind;
  f.set(body, 1);
  return f;
};

export function openTerminal(el: HTMLElement, opts: TermOptions): Promise<TermHandle> {
  const term = new Terminal({
    theme: kanagawaTerm,
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-mono"),
    fontSize: 13,
    scrollback: 10_000,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(el);
  if (opts.renderer === "webgl") term.loadAddon(new WebglAddon());
  fit.fit();

  const ws = backend.stream("pty");
  const input = (data: string) => ws.send(frame(0, enc.encode(data)));
  term.onData(input);
  term.onResize(({ cols, rows }) => ws.send(frame(1, enc.encode(JSON.stringify({ cols, rows })))));
  ws.onmessage = (ev) => term.write(new Uint8Array(ev.data as ArrayBuffer));
  ws.onclose = () => term.write("\r\n[process exited]\r\n");

  const onResize = () => fit.fit();
  window.addEventListener("resize", onResize);

  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({ cols: term.cols, rows: term.rows, windowMs: opts.windowMs ?? 0, maxBytes: opts.maxBytes ?? 0 }));
      resolve({
        term,
        ws,
        input,
        dispose: () => {
          window.removeEventListener("resize", onResize);
          ws.close();
          term.dispose();
        },
      });
    };
    ws.onerror = () => reject(new Error("pty stream failed"));
  });
}
