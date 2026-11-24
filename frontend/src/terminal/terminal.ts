// xterm.js on a Wails "pty" stream (ADR-0013): the terminal provider for panes and the bottom panel.
import { Terminal, type ILink, type ILinkProvider, type IMarker } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { backend } from "../core/backend";
import { isMac } from "../core/keymap";
import { settings } from "../core/settings";
import { terminalTheme } from "../theme/themes";
import { fileLinks } from "./links";
import { parseOsc7 } from "./osc";

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
  gpu(on: boolean): void; // WebGL on or off: a terminal nobody sees gives its canvas and glyph atlas back
  dispose(): void;
}

const enc = new TextEncoder();
const frame = (kind: number, body: Uint8Array) => {
  const f = new Uint8Array(body.length + 1);
  f[0] = kind;
  f.set(body, 1);
  return f;
};

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

const defaultRenderer = () => (new URLSearchParams(location.search).get("renderer") === "dom" || !isMac ? "dom" : "webgl");

// The buffer as text; a line the terminal wrapped joins the one before it.
function bufferText(t: Terminal): string {
  const b = t.buffer.active;
  let out = "";
  for (let i = 0; i < b.length; i++) {
    const l = b.getLine(i)!;
    out += (i && !l.isWrapped ? "\n" : "") + l.translateToString(true);
  }
  return out;
}

// path:line:col in the output as links. Plain clicks, like the URLs next to them.
// A row that continues a wrapped line is no link: its path would be cut off at the wrap.
// cwdAt(row, col): the directory the shell was in when the text there was written.
export function fileLinkProvider(
  term: Terminal,
  onOpenFile: (path: string, line: number, col?: number, cwd?: string) => void,
  cwdAt: (row: number, col: number) => string = () => "",
): ILinkProvider {
  return {
    provideLinks(y, callback) {
      const line = term.buffer.active.getLine(y - 1);
      if (line?.isWrapped) {
        return callback(undefined);
      }
      if (!line) {
        return callback(undefined);
      }
      const text = line.translateToString(true);
      // The cell column of each UTF-16 index: a wide character takes two cells, an emoji two code units.
      const cols: number[] = [];
      for (let x = 0; x < line.length; x++) {
        const c = line.getCell(x)!;
        if (c.getWidth()) {
          cols.push(...Array<number>((c.getChars() || " ").length).fill(x));
        }
      }
      const links: ILink[] = fileLinks(text).map((l) => ({
        range: { start: { x: cols[l.start] + 1, y }, end: { x: cols[l.end - 1] + 1, y } },
        text: text.slice(l.start, l.end),
        activate: () => onOpenFile(l.path, l.line, l.col, cwdAt(y - 1, cols[l.start])),
      }));
      callback(links.length ? links : undefined);
    },
  };
}

// OSC 7 as it arrives, kept per row: a link in old output resolves against where the shell was then.
export function trackCwd(term: Terminal) {
  let base = "",
    now = "";
  const marks: { m: IMarker; cwd: string; x: number }[] = []; // x: the column the shell was at when it said so
  term.parser.registerOscHandler(7, (data) => {
    const c = parseOsc7(data);
    if (c && c !== now) {
      now = c;
      const m = term.registerMarker(0);
      if (m) {
        const k = { m, cwd: c, x: term.buffer.active.cursorX };
        marks.push(k);
        m.onDispose(() => {
          // scrolled out of the scrollback
          base = k.cwd;
          marks.splice(marks.indexOf(k), 1);
        });
      }
    }
    return true;
  });
  return {
    now: () => now,
    at(row: number, col = 0) {
      let c = base;
      for (const k of marks) {
        if (k.m.line < row || (k.m.line === row && k.x <= col)) {
          c = k.cwd;
        }
      }
      return c || now;
    },
  };
}

export function openTerminal(el: HTMLElement, opts: TermOptions = {}): TermHandle {
  const term = new Terminal({
    theme: terminalTheme(),
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-mono"),
    fontSize: termFontSize(),
    // A shell's 10 000 lines cost ~15 MB of WebView RAM per terminal at full size; a task's output is read back at exit, so it keeps them.
    scrollback: opts.onOutput ? 10_000 : 3_000,
    allowProposedApi: true, // unicode11
  });
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = "11";
  term.loadAddon(new WebLinksAddon((_e, uri) => void backend.openURL(uri)));
  const cwd = trackCwd(term);
  if (opts.onOpenFile) {
    term.registerLinkProvider(fileLinkProvider(term, opts.onOpenFile, cwd.at));
  }
  term.open(el);
  const wantGl = (opts.renderer ?? defaultRenderer()) === "webgl";
  let gl: WebglAddon | undefined;
  // Without the addon xterm draws with the DOM renderer, so a hidden terminal stays correct and costs no GPU memory.
  const gpu = (on: boolean) => {
    if (on && wantGl && !gl) {
      term.loadAddon((gl = new WebglAddon()));
    } else if (!on && gl) {
      gl.dispose();
      gl = undefined;
    }
  };
  gpu(true);
  el.dataset.term = "";

  const ws = backend.stream("pty");
  // Go reads the config as the first frame (onopen below); keys or a resize before it would end the shell.
  let started = false;
  const live = () => started && ws.readyState === WebSocket.OPEN;
  const input = (data: string) => live() && ws.send(frame(0, enc.encode(data)));
  term.onData(input);
  term.onResize(({ cols, rows }) => live() && ws.send(frame(1, enc.encode(JSON.stringify({ cols, rows })))));
  let liveTimer: ReturnType<typeof setTimeout> | undefined;
  ws.onmessage = (ev) => {
    term.write(new Uint8Array(ev.data as ArrayBuffer), () => {
      if (opts.onLiveOutput && !disposed) {
        if (liveTimer) {
          clearTimeout(liveTimer);
        }
        liveTimer = setTimeout(() => {
          if (!disposed && opts.onLiveOutput) {
            opts.onLiveOutput(bufferText(term));
          }
        }, 150);
      }
    });
  };
  let disposed = false;
  ws.onclose = () => {
    if (disposed) {
      return;
    }
    // After the write callback, the last output is in the buffer too.
    term.write("\r\n[process exited]\r\n", () => {
      if (disposed) {
        return;
      }
      if (opts.onOutput) {
        opts.onOutput(bufferText(term));
      }
      opts.onExit?.();
    });
  };

  // Panes resize on splits and when the panel shows; a hidden element has no size to fit to.
  const ro = new ResizeObserver(() => el.clientWidth && el.clientHeight && fit.fit());
  ro.observe(el);

  let mode: TermMode = "terminal";
  const setMode = (m: TermMode) => {
    mode = m;
    el.dataset.mode = m;
    term.options.disableStdin = m === "normal"; // also blocks paste
    if (m === "terminal") {
      term.scrollToBottom();
    }
    opts.onMode?.(m);
  };
  setMode("terminal");

  // Normal mode: Vim-like keys move through the scrollback; nothing reaches the shell.
  let last = "";
  const half = () => Math.max(1, Math.floor(term.rows / 2));
  term.attachCustomKeyEventHandler((e) => {
    if (mode === "terminal") {
      return true;
    }
    if (e.metaKey || (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "V" || e.key === "c" || e.key === "v"))) {
      return true;
    } // Cmd+C/V on macOS, Ctrl+Shift+C/V on Windows/Linux
    if (e.type !== "keydown") {
      return false;
    }
    const k = e.ctrlKey ? `C-${e.key}` : e.key;
    switch (k) {
      case "i":
      case "a":
      case "I":
      case "A":
        setMode("terminal");
        break;
      case "j":
      case "ArrowDown":
        term.scrollLines(1);
        break;
      case "k":
      case "ArrowUp":
        term.scrollLines(-1);
        break;
      case "C-d":
        term.scrollLines(half());
        break;
      case "C-u":
        term.scrollLines(-half());
        break;
      case "g":
        term.scrollToTop();
        break;
      case "G":
        term.scrollToBottom();
        break;
      case "y":
        void navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        term.clearSelection();
        break;
      case "/":
        ask();
        break;
      case "n":
        if (last) {
          search.findNext(last);
        }
        break;
      case "N":
        if (last) {
          search.findPrevious(last);
        }
        break;
    }
    e.preventDefault();
    return false;
  });

  // "/" opens a one-line search box over the terminal, like Vim's search prompt.
  const ask = () => {
    const box = document.createElement("input");
    box.className = "term-search";
    box.setAttribute("aria-label", "Search terminal");
    box.value = last;
    el.append(box);
    box.focus();
    box.select();
    box.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && box.value) {
        search.findPrevious((last = box.value));
      } // from the bottom up, like ?
      if (e.key === "Enter" || e.key === "Escape") {
        box.remove();
        term.focus();
      }
    };
    box.onblur = () => box.remove();
  };

  const ready = new Promise<void>((resolve, reject) => {
    ws.onopen = () => {
      fit.fit();
      ws.send(
        JSON.stringify({
          cols: term.cols,
          rows: term.rows,
          ws: opts.ws ?? "",
          cmd: opts.cmd ?? "",
          dir: opts.dir ?? "",
          windowMs: opts.windowMs ?? 0,
          maxBytes: opts.maxBytes ?? 0,
        }),
      );
      started = true;
      resolve();
    };
    ws.onerror = () => reject(new Error("pty stream failed"));
  });

  return {
    term,
    ws,
    ready,
    input,
    cwd: cwd.now,
    setMode,
    focus: () => term.focus(),
    gpu,
    setFont() {
      term.options.theme = terminalTheme(); // a changed theme in settings.json reaches open terminals here too
      term.options.fontFamily = getComputedStyle(document.documentElement).getPropertyValue("--font-mono");
      term.options.fontSize = termFontSize();
      if (el.clientWidth && el.clientHeight) {
        fit.fit();
      }
    },
    dispose: () => {
      disposed = true;
      if (liveTimer) {
        clearTimeout(liveTimer);
      }
      ro.disconnect();
      ws.close(); // Go hangs up the shell's process group
      term.dispose();
      delete el.dataset.term;
      delete el.dataset.mode;
    },
  };
}
