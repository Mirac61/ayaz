// Keymaps are data: context + keys → command ID (ADR-0010). Keys use Vim notation: "<Space>ff", "<C-w>h", "<D-p>" (Cmd).
//   normal: Vim normal mode in the editor (mapped through codemirror-vim) and the file tree.
//   global: everywhere, also in insert mode; meant for chords with Cmd/Ctrl.
//   terminal: a terminal in terminal mode (keys go to the shell otherwise). Terminal normal mode uses "normal".

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
    n("<Space>ff", "find.files"),
    n("<Space>fo", "find.recent"),
    n("<Space>fb", "find.buffers"),
    n("<Space>fk", "find.commands"),
    ...Object.entries(panes).flatMap(([k, cmd]) => [n(`<C-${k}>`, cmd), n(`<C-w>${k}`, cmd), t(`<C-${k}>`, cmd)]),
    t("<C-\\><C-n>", "term.normal"),
    n("<Space>mr", "md.reading"),
    n("<Space>t", "term.panel"),
    n("<Space>tc", "term.split"),
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
    ...(mac
      ? [g("<D-p>", "find.files"), g("<D-S-p>", "find.commands"), g("<D-j>", "term.panel")]
      : [g("<C-S-p>", "find.files"), g("<C-S-j>", "term.panel")]),
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
  const data: unknown = JSON.parse(json);
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

type KeyEv = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

// One key press in the same notation as parseKeys; "" for a lone modifier.
export function keyName(e: KeyEv): string {
  if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return "";
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
