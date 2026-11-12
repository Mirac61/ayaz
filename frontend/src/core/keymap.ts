// Keymaps are data: context + keys → command ID (ADR-0010). Keys use Vim notation: "<Space>ff", "<C-w>h", "<D-p>" (Cmd).
//   normal: Vim normal mode in the editor (mapped through codemirror-vim) and the file tree.
//   global: everywhere, also in insert mode; meant for chords with Cmd/Ctrl.
//   terminal: a terminal in terminal mode (keys go to the shell otherwise). Terminal normal mode uses "normal".

import { stripJsonc } from "./settings";

export type Context = "normal" | "global" | "terminal";
const CONTEXTS: Context[] = ["normal", "global", "terminal"];

export interface Binding {
  keys: string;
  command: string; // "" in a user keymap removes the default
  context: Context;
  arg?: string;
}

export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

// Defaults from ~/.config/nvim (02-architecture), plus Cmd+… on macOS and Ctrl+Shift+… on Linux (Q22).
export function defaultKeymap(mac = isMac): Binding[] {
  const n = (keys: string, command: string, arg?: string): Binding => ({ keys, command, context: "normal", arg });
  const g = (keys: string, command: string): Binding => ({ keys, command, context: "global" });
  const t = (keys: string, command: string): Binding => ({ keys, command, context: "terminal" });
  const panes = { h: "pane.left", j: "pane.down", k: "pane.up", l: "pane.right" };
  return [
    n("<Space>e", "tree.focus"),
    n("<Space>er", "tree.revealCurrent"),
    n("<Space>a", "harpoon.toggle"),
    n("<Space>1", "harpoon.goto1"),
    n("<Space>2", "harpoon.goto2"),
    n("<Space>3", "harpoon.goto3"),
    n("<Space>4", "harpoon.goto4"),
    n("<Space>fa", "harpoon.menu"),
    n("<Space>ff", "find.files"),
    n("<Space>fo", "find.recent"),
    n("<Space>fb", "find.buffers"),
    n("<Space>fk", "find.commands"),
    n("<Space>fw", "find.grep"),
    n("<Space>fp", "folder.switch"),
    n("<Space>fy", "file.copyPathLine"),
    n("<Space>ft", "theme.switch"),
    n("<Space>fs", "lsp.symbols"),
    n("<Space>fS", "lsp.workspaceSymbols"),
    n("<Space>fd", "lsp.diagnostics"),
    n("<Space>fh", "file.history"),
    n("<Space>rr", "task.run"),
    n("<Space>rl", "task.last"),
    n("<Space>cr", "lsp.rename"),
    n("<Space>ca", "lsp.codeAction"),
    n("<Space>ci", "lsp.incomingCalls"),
    n("<Space>co", "lsp.outgoingCalls"),
    n("]d", "lsp.nextDiagnostic"),
    n("[d", "lsp.prevDiagnostic"),
    n("]q", "qf.next"),
    n("[q", "qf.prev"),
    n("]c", "git.nextHunk"),
    n("[c", "git.prevHunk"),
    n("<Space>hp", "git.previewHunk"),
    n("<Space>hr", "git.resetHunk"),
    n("<Space>hs", "git.stageHunk"),
    n("<Space>db", "debug.toggleBreakpoint"),
    n("<Space>dB", "debug.conditionalBreakpoint"),
    n("<Space>dd", "debug.start"),
    n("<Space>dc", "debug.continue"),
    n("<Space>dn", "debug.next"),
    n("<Space>ds", "debug.stepIn"),
    n("<Space>do", "debug.stepOut"),
    n("<Space>dq", "debug.stop"),
    n("<Space>dl", "debug.output"),
    n("<Space>dv", "debug.variables"),
    n("<Space>dw", "debug.addWatch"),
    n("<Space>de", "debug.evaluate"),
    n("<Space>mo", "git.conflictOurs"),
    n("<Space>mt", "git.conflictTheirs"),
    n("<Space>mb", "git.conflictBoth"),
    n("]x", "git.nextConflict"),
    n("[x", "git.prevConflict"),
    n("<Space>hu", "git.unstageHunk"),
    n("<Space>ga", "git.stageFile"),
    n("<Space>gu", "git.unstageFile"),
    n("<Space>gA", "git.stageAll"),
    n("<Space>gU", "git.unstageAll"),
    n("<Space>gd", "git.diff"),
    n("<Space>gD", "git.diffSplit"),
    n("<Space>gc", "git.commit"),
    n("<Space>gb", "git.blame"),
    n("<Space>gs", "git.status"),
    ...Object.entries(panes).flatMap(([k, cmd]) => [n(`<C-${k}>`, cmd), n(`<C-w>${k}`, cmd), t(`<C-${k}>`, cmd)]),
    t("<C-\\><C-n>", "term.normal"),
    n("<Space>mr", "md.reading"),
    n("<Space>mp", "md.preview"),
    n("<Space>ms", "md.skin"),
    n("<Space>mh", "md.outline"),
    n("<Space>bd", "tab.close"),
    n("<Space>uw", "view.wrap"),
    n("<Space>ud", "view.diagnosticText"),
    n("<Space>ub", "git.toggleInlineBlame"),
    n("<Space>uz", "view.zen"),
    n("<Space>t", "term.panel"),
    n("<Space>tc", "term.split"),
    n("<Space>tf", "term.float"),
    n("<Space>ts", "term.send"),
    g("<C-CR>", "term.send"),
    n("<Space>gg", "term.lazygit"),
    n("<C-w>s", "pane.splitDown"),
    n("<C-w>v", "pane.splitRight"),
    n("<C-w>c", "pane.close"),
    n("<C-w>q", "pane.close"),
    n("<C-w>+", "pane.taller"),
    n("<C-w>-", "pane.shorter"),
    n("<C-w>>", "pane.wider"),
    n("<C-w><", "pane.narrower"),
    n("<C-w>=", "pane.equal"),
    n("<C-w>z", "term.maximize"),
    g("<F5>", "debug.continue"), // starts the debugger when none runs, like VS Code
    g("<F10>", "debug.next"),
    g("<F11>", "debug.stepIn"),
    g("<S-F11>", "debug.stepOut"),
    ...(mac
      ? [g("<D-p>", "find.files"), g("<D-S-p>", "find.commands"), g("<D-j>", "term.panel"), g("<D-S-n>", "window.new"),
        g("<D-,>", "settings.open"), g("<D-b>", "view.sidebar")]
      : [g("<C-p>", "find.files"), g("<C-S-p>", "find.commands"), g("<C-j>", "term.panel"), g("<C-S-j>", "term.panel"),
        g("<C-S-n>", "window.new"), g("<C-,>", "settings.open"), g("<C-b>", "view.sidebar"), g("<C-S-b>", "view.sidebar")]),
    ...(mac
      ? [g("<D-w>", "tab.close"), g("<D-S-t>", "tab.reopen"), g("<D-[>", "nav.back"), g("<D-]>", "nav.forward"), g("<C-->", "nav.back"),
        g("<C-S-_>", "nav.forward")] // Ctrl -, Ctrl Shift - like VS Code on macOS: brackets need Alt on German layouts
      : [g("<C-F4>", "tab.close"), g("<C-S-w>", "tab.close"), g("<C-S-t>", "tab.reopen"), g("<A-Left>", "nav.back"), g("<A-Right>", "nav.forward")]),
    // "+" has its own key on German layouts, "=" on US ones.
    ...[["=", "view.zoomIn"], ["+", "view.zoomIn"], ["-", "view.zoomOut"], ["0", "view.zoomReset"]]
      .map(([k, cmd]) => g(`<${mac ? "D" : "C"}-${k}>`, cmd)),
    g("<F1>", "find.commands"),
  ];
}

// A user binding replaces the default with the same context and keys; command "" just removes it.
export function mergeKeymap(defaults: Binding[], user: Binding[]): Binding[] {
  const id = (b: Binding) => `${b.context} ${parseKeys(b.keys).join("")}`;
  const replaced = new Set(user.map(id));
  return [...defaults.filter((b) => !replaced.has(id(b))), ...user.filter((b) => b.command !== "")];
}

// Checks a user keymap.json; returns the bindings or throws with a message for the status line.
export function parseUserKeymap(json: string, known: (id: string) => boolean): Binding[] {
  let data: unknown;
  try {
    data = JSON.parse(stripJsonc(json));
  } catch (e) {
    throw new Error(`keymap.json: ${e instanceof Error ? e.message : e}`);
  }
  if (!Array.isArray(data)) throw new Error("keymap.json: expected a list of bindings");
  return data.map((b, i) => {
    const where = `keymap.json entry ${i + 1}`;
    if (typeof b?.keys !== "string" || !parseKeys(b.keys).length) throw new Error(`${where}: "keys" missing`);
    if (typeof b.command !== "string") throw new Error(`${where}: "command" missing`);
    if (b.command && !known(b.command)) throw new Error(`${where}: unknown command "${b.command}"`);
    const context = b.context ?? "normal";
    if (!CONTEXTS.includes(context)) throw new Error(`${where}: context is "normal", "global" or "terminal"`);
    return { keys: b.keys, command: b.command, context, ...(typeof b.arg === "string" && { arg: b.arg }) };
  });
}

const MODS = ["C", "A", "S", "D"]; // canonical order inside <…>

// "<Space>ff" → ["<Space>", "f", "f"], "<S-C-P>" → ["<C-S-p>"].
export function parseKeys(keys: string): string[] {
  const out: string[] = [];
  for (const [, tok, ch] of keys.matchAll(/<([^<>]+)>|(.)/gs)) {
    if (ch !== undefined) { out.push(ch); continue; }
    const parts = tok.split("-");
    let key = parts.pop()!;
    if (key === "") key = "-"; // "<C-->"
    key = CANON[key.toLowerCase()] ?? key;
    const mods = parts.map((m) => m.toUpperCase()).filter((m) => MODS.includes(m));
    if (mods.length && key.length === 1) key = key.toLowerCase();
    out.push(mods.length ? `<${MODS.filter((m) => mods.includes(m)).join("-")}-${key}>` : key.length === 1 ? key : `<${key}>`);
  }
  return out;
}

const NAMED: Record<string, string> = {
  " ": "Space", Escape: "Esc", Enter: "CR", Tab: "Tab", Backspace: "BS", Delete: "Del",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
};

// "<space>", "<ESC>", "<f1>" → the spelling keyName produces.
const CANON: Record<string, string> = Object.fromEntries(
  [...Object.values(NAMED), ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`)].map((n) => [n.toLowerCase(), n]),
);

type KeyEv = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"> & {
  getModifierState?(keyArg: string): boolean;
};

// One key press in the same notation as parseKeys; "" for a lone modifier.
export function keyName(e: KeyEv): string {
  if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return "";
  // AltGr on Windows/Linux sets both ctrlKey and altKey (or getModifierState("AltGraph")).
  // It is used to type characters like { } [ ] \ @ ~ | and must not trigger shortcut chords.
  if (
    (typeof e.getModifierState === "function" && e.getModifierState("AltGraph")) ||
    (e.ctrlKey && e.altKey && e.key.length === 1 && !/^[a-zA-Z0-9]$/.test(e.key))
  ) {
    return "";
  }
  const named = NAMED[e.key] ?? (/^F\d+$/.test(e.key) ? e.key : undefined);
  const mods = [e.ctrlKey && "C", e.altKey && "A", e.metaKey && "D"].filter(Boolean) as string[];
  if (!mods.length) return named ? `<${(e.shiftKey && named !== "Space" ? "S-" : "") + named}>` : e.key;
  if (e.shiftKey) mods.push("S");
  // With Alt (macOS) or Shift, e.key is a different char; e.code still names the physical key.
  const m = /^(?:Key|Digit)(.)$/.exec(e.code);
  const key = named ?? (m ? m[1].toLowerCase() : e.key.toLowerCase());
  return `<${MODS.filter((x) => mods.includes(x)).join("-")}-${key}>`;
}

// Turns key presses into bindings, with multi-key sequences and Vim's timeout:
// "<Space>t" fires after `timeout` ms unless "<Space>tc" continues it. A prefix that is no binding itself ("<Space>")
// waits without timeout, like which-key, so its hints can be read. onPending gets the keys so far and what may follow.
export class Sequencer {
  private pending: string[] = [];
  private scope: Binding[] | null = null; // set by prime: what the pending keys may continue into
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private fire: (b: Binding) => void,
    private onPending: (keys: string[], next: Binding[]) => void = () => {},
    private timeout = 400, // nvim timeoutlen from my config
  ) {}

  private setPending(keys: string[], scope: Binding[] = []) {
    const was = this.pending.length;
    this.pending = keys;
    if (keys.length) this.onPending(keys, scope.filter((b) => parseKeys(b.keys).length > keys.length && startsWith(parseKeys(b.keys), keys)));
    else if (was) this.onPending([], []);
  }

  // Returns true if the key was used (part of a binding), so the caller stops the event.
  feed(token: string, bindings: Binding[]): boolean {
    clearTimeout(this.timer);
    const scope = this.pending.length && this.scope ? this.scope : bindings;
    const seq = [...this.pending, token];
    const matches = scope.filter((b) => startsWith(parseKeys(b.keys), seq));
    const exact = matches.find((b) => parseKeys(b.keys).length === seq.length);
    const longer = matches.some((b) => parseKeys(b.keys).length > seq.length);
    if (!matches.length) {
      if (!this.pending.length) return false;
      // Dead end: like Vim, a complete shorter binding ("<Space>t" before "x") runs, then the key counts on its own.
      const done = scope.find((b) => parseKeys(b.keys).length === this.pending.length && startsWith(parseKeys(b.keys), this.pending));
      this.setPending([]);
      this.scope = null;
      if (done) this.fire(done);
      return this.feed(token, bindings);
    }
    if (exact && !longer) {
      this.setPending([]);
      this.scope = null;
      this.fire(exact);
      return true;
    }
    this.setPending(seq, scope);
    if (exact)
      this.timer = setTimeout(() => {
        this.setPending([]);
        this.scope = null;
        this.fire(exact);
      }, this.timeout);
    return true;
  }

  reset() {
    clearTimeout(this.timer);
    this.setPending([]);
    this.scope = null;
  }

  // Continues a sequence another matcher already read (codemirror-vim fires "<Space>t" at once,
  // this waits whether "c" follows). bindings: what it may continue into.
  prime(keys: string, bindings: Binding[]) {
    this.reset();
    for (const k of parseKeys(keys)) this.feed(k, bindings);
    if (this.pending.length) this.scope = bindings;
  }
}

const startsWith = (keys: string[], seq: string[]) => keys.length >= seq.length && seq.every((k, i) => keys[i] === k);
