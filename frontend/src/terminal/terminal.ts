// The terminal provider for panes and the bottom panel. xterm.js on a Wails "pty" stream (ADR-0013) lives in xterm.ts and
// loads with the first terminal; everything here stays small enough for the start chunk.
import type { Terminal } from "@xterm/xterm";
import { settings } from "../core/settings";

// "terminal": keys go to the shell (nvim's terminal mode); "normal": scrollback, search, copy (Ctrl-\ Ctrl-n).
export type TermMode = "terminal" | "normal";

export interface TermOptions {
  // S6: no difference on macOS, so WebGL there (less main-thread work); DOM on Linux until measured on Hyprland.
  // ?renderer=dom forces DOM, E2E needs it (WebGL draws to a canvas, no text to assert on).
  renderer?: "dom" | "webgl";
  ws?: string; // workspace ID: start in its root; none = home
  cmd?: string; // run this instead of an interactive shell, e.g. "lazygit"
  dir?: string; // start here instead of the workspace root (a folder the shell of another terminal had cd'ed to)
  onExit?(): void;
  onOpenFile?(path: string, line: number, col?: number, cwd?: string): void; // a click on path:line:col in the output
  onOutput?(text: string): void; // at exit, everything it printed (scrollback included), for tasks' problem lines
  onLiveOutput?(text: string): void; // while running, debounced live output for watchers
  onMode?(m: TermMode): void;
  windowMs?: number; // batching knobs, Spike S6
  maxBytes?: number;
}

export interface TermHandle {
  term: Terminal;
  ws: WebSocket;
  ready: Promise<void>; // the stream is open and the shell is starting
  input(data: string): void;
  cwd(): string; // where the shell says it is (OSC 7), "" until it says
  setMode(m: TermMode): void;
  focus(): void;
  setFont(): void; // takes font and size from settings again
  dispose(): void;
}

// Zoom with a terminal focused changes this many px on top of the terminal's size, for every terminal.
const ZOOM_KEY = "ayaz.termZoom";
export function termZoom(): number {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    return Number.isInteger(z) && z >= -6 && z <= 24 ? z : 0;
  } catch {
    return 0; // storage blocked
  }
}
export function setTermZoom(z: number) {
  try {
    localStorage.setItem(ZOOM_KEY, String(Math.min(24, Math.max(-6, z))));
  } catch {
    /* a convenience */
  }
}
// settings.json's terminalFontSize (else fontSize), plus the terminal zoom.
export const termFontSize = () => Math.max(6, (settings().terminalFontSize ?? settings().fontSize) + termZoom());

// Returns at once; xterm loads behind it. Calls made before that wait for it in order, `term` and `ws` exist after `ready`.
export function openTerminal(el: HTMLElement, opts: TermOptions = {}): TermHandle {
  let impl: TermHandle | undefined;
  let gone = false;
  // The mode xterm starts in; a pane shown right away reads it.
  el.dataset.mode = "terminal";
  const loaded = import("./xterm").then(({ openXterm }) => {
    if (!gone) {
      impl = openXterm(el, opts);
    }
    return impl;
  });
  const ready = loaded.then((h) => h?.ready);
  // A stream that failed rejects `ready`; whoever awaits it handles that, the calls below don't need to.
  ready.catch(() => {});
  // At once when xterm is there, else in the order the calls came.
  const later = (f: (h: TermHandle) => void) => (impl ? f(impl) : void loaded.then((h) => h && f(h)));
  const need = <K extends "term" | "ws">(k: K): TermHandle[K] => {
    if (!impl) {
      throw new Error(`terminal.${k} is there after ready`);
    }
    return impl[k];
  };
  return {
    get term() {
      return need("term");
    },
    get ws() {
      return need("ws");
    },
    ready: ready as Promise<void>,
    input: (data) => later((h) => h.input(data)),
    cwd: () => impl?.cwd() ?? "",
    setMode: (m) => later((h) => h.setMode(m)),
    focus: () => later((h) => h.focus()),
    setFont: () => later((h) => h.setFont()),
    dispose() {
      gone = true;
      impl?.dispose();
      delete el.dataset.mode;
    },
  };
}
