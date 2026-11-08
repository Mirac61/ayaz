import { EditorState, Transaction, Annotation } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";
import type { Files } from "../core/backend";
import { Buffers, diff, isDirty, type Buffer } from "../core/buffers";
import { createState, editorExtensions } from "../editor/editor";
import { linkAt } from "../editor/mdlive";
import { openTerminal, type TermHandle, type TermOptions } from "../terminal/terminal";

export interface Status {
  pane: number;
  path: string | null;
  dirty: boolean;
  mode: string;
  line: number;
  col: number;
  lines: number;
}

// A pane shows an editor (view) or a terminal (term).
// shortcut: a terminal lives and dies with its pane, unlike nvim's terminal buffers; add hidden terminals if wanted.
interface Pane { el: HTMLElement; view?: EditorView; term?: TermHandle; title?: string; buf: Buffer | null; mode: string }

// Marks changes copied from another pane showing the same buffer, so they aren't copied back.
const synced = Annotation.define<boolean>();
const RECENT_MAX = 100;

// The panes of one workspace (editors and terminals) and the buffers they show. Layout (where panes sit) is the workbench's job.
export class Editors {
  readonly buffers: Buffers;
  private panes = new Map<number, Pane>();
  private mru: string[] = []; // buffers, most recent first
  private recentKey: string;
  private lastEditor = 0; // where files open while a terminal pane is active
  active = 0;

  constructor(files: Files, root: string, private onStatus: (s: Status) => void) {
    this.buffers = new Buffers(files, createState);
    this.recentKey = `ayaz.recent:${root}`;
  }

  // Creates the view for pane `id`. A split passes `from`, and the new pane shows the same buffer.
  // With term, the pane runs a terminal instead.
  attach(id: number, parent: HTMLElement, from?: number, term?: TermOptions) {
    if (term) {
      const p: Pane = { el: parent, buf: null, mode: "terminal", title: term.cmd ?? "shell" };
      this.panes.set(id, p);
      p.term = openTerminal(parent, { ...term, onMode: (m) => { p.mode = m; if (id === this.active) this.emit(); } });
      parent.addEventListener("focusin", () => this.setActive(id));
      this.focus(id);
      return;
    }
    const view = new EditorView({
      parent,
      state: EditorState.create({ extensions: editorExtensions() }),
      dispatchTransactions: (trs, v) => this.dispatch(id, trs, v),
    });
    const p: Pane = { el: parent, view, buf: null, mode: "normal" };
    this.panes.set(id, p);
    if (!this.panes.has(this.active)) this.active = id;
    view.contentDOM.addEventListener("focus", () => this.setActive(id));
    const src = from === undefined ? undefined : this.panes.get(from)?.buf;
    if (src) this.show(id, src);
    else this.watchMode(id);
  }

  detach(id: number) {
    const p = this.panes.get(id);
    p?.view?.destroy();
    p?.term?.dispose();
    this.panes.delete(id);
  }

  focus(id: number) {
    const p = this.panes.get(id);
    if (p?.view) p.view.focus();
    else p?.term?.focus();
    this.setActive(id);
  }

  isTerm(id = this.active) { return !!this.panes.get(id)?.term; }

  // An editor pane with no file: a new terminal takes it over instead of splitting.
  isEmpty(id = this.active) { const p = this.panes.get(id); return !!p?.view && !p.buf; }

  // Swaps what pane id shows: a terminal, or an empty editor without term.
  replace(id: number, term?: TermOptions) {
    const p = this.panes.get(id);
    if (!p) return;
    const wasActive = id === this.active;
    this.detach(id);
    this.attach(id, p.el, undefined, term);
    if (wasActive) this.focus(id);
  }

  // Vim is between commands (no count, operator or partial keys), so a key may start a leader sequence.
  vimIdle(id = this.active): boolean {
    const v = this.panes.get(id)?.view;
    const vim = v && (getCM(v)?.state.vim as { insertMode?: boolean; visualMode?: boolean; inputState?: { keyBuffer: string[]; operator: unknown } } | undefined);
    return !!vim && !vim.insertMode && !vim.visualMode && !vim.inputState?.keyBuffer.length && !vim.inputState?.operator;
  }

  // Ctrl-\ Ctrl-n in the active terminal.
  termNormal() { this.panes.get(this.active)?.term?.setMode("normal"); }

  // The link target under the active editor's cursor (gx, gf).
  linkAtCursor(): string | null {
    const v = this.panes.get(this.active)?.view;
    return v ? linkAt(v.state, v.state.selection.main.head) : null;
  }

  current(): Buffer | null { return this.panes.get(this.active)?.buf ?? null; }

  // From a terminal pane, the file opens in the editor pane used last.
  async open(path: string, id = this.active) {
    if (this.isTerm(id)) id = this.panes.get(this.lastEditor)?.view ? this.lastEditor : [...this.panes].find(([, p]) => p.view)?.[0] ?? -1;
    if (!this.panes.get(id)?.view) throw new Error("No editor pane, split one off with :vsplit");
    this.show(id, await this.buffers.open(path));
  }

  // Re-reads the active buffer from disk (`:e!`).
  async reload() {
    const b = this.current();
    if (b) this.show(this.active, await this.buffers.load(b.path));
  }

  // Brings loaded buffers in line with disk after a watcher event (null = check all). Clean buffers reload in place,
  // keeping cursor and undo; returns a notice for dirty or deleted ones.
  async diskChanged(paths: string[] | null): Promise<string | null> {
    const hit = (p: string) => !paths || paths.some((c) => p === c || p.startsWith(c + "/")); // a folder covers its files
    let note: string | null = null;
    for (const b of this.buffers.list().filter((b) => hit(b.path))) {
      const r = await this.buffers.checkDisk(b).catch(() => ({ kind: "same" as const })); // unreadable now: leave it
      if (r.kind === "conflict") note ??= `"${b.path}" changed on disk. :w! overwrites, :e! reloads`;
      else if (r.kind === "deleted") note ??= `"${b.path}" was deleted on disk`;
      else if (r.kind === "reload") {
        const change = diff(b.state.doc.toString(), r.content);
        const pane = [...this.panes.values()].find((p) => p.buf === b);
        if (pane?.view) pane.view.dispatch({ changes: change }); // dispatch() copies it to other panes and into b.state
        else b.state = b.state.update({ changes: change }).state;
        b.saved = b.state.doc;
        b.mtime = r.mtime;
      }
    }
    this.emit();
    return note;
  }

  show(id: number, b: Buffer) {
    // `:e!` creates a new Buffer object; other panes still showing the old one switch too.
    for (const [oid, o] of this.panes) if (oid === id || o.buf?.path === b.path && o.buf !== b) this.setBuf(oid, b);
    this.touch(b.path);
    this.focus(id);
  }

  private setBuf(id: number, b: Buffer) {
    const p = this.panes.get(id)!;
    p.buf = b;
    p.view!.setState(b.state);
    p.mode = "normal";
    this.watchMode(id); // setState recreates the vim plugin
  }

  // Loaded buffers, most recently shown first.
  bufferList(): Buffer[] {
    return this.mru.map((p) => this.buffers.get(p)).filter((b): b is Buffer => !!b);
  }

  // Files opened in this folder, also in earlier sessions, most recent first.
  recent(): string[] {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(this.recentKey) ?? "[]");
      return Array.isArray(saved) ? saved.filter((x) => typeof x === "string") : [];
    } catch {
      return []; // storage blocked or corrupt: no history, nothing else breaks
    }
  }

  emit() {
    const p = this.panes.get(this.active);
    if (!p) return;
    if (!p.view) {
      return this.onStatus({ pane: this.active, path: `term://${p.title}`, dirty: false, mode: p.mode, line: 1, col: 1, lines: 1 });
    }
    const st = p.view.state, head = st.selection.main.head, l = st.doc.lineAt(head);
    this.onStatus({
      pane: this.active,
      path: p.buf?.path ?? null,
      dirty: p.buf ? isDirty(p.buf) : false,
      mode: p.mode,
      line: l.number,
      col: head - l.from + 1,
      lines: st.doc.lines,
    });
  }

  private setActive(id: number) {
    if (!this.panes.has(id)) return;
    this.active = id;
    if (this.panes.get(id)!.view) this.lastEditor = id;
    const b = this.panes.get(id)!.buf;
    if (b) this.touch(b.path);
    this.emit();
  }

  private touch(path: string) {
    this.mru = [path, ...this.mru.filter((p) => p !== path)];
    try {
      const r = [path, ...this.recent().filter((p) => p !== path)].slice(0, RECENT_MAX);
      localStorage.setItem(this.recentKey, JSON.stringify(r));
    } catch {
      // storage blocked: recent files are a convenience
    }
  }

  private watchMode(id: number) {
    const p = this.panes.get(id)!;
    getCM(p.view!)?.on("vim-mode-change", (e: { mode: string }) => {
      p.mode = e.mode;
      if (id === this.active) this.emit();
    });
  }

  private dispatch(id: number, trs: readonly Transaction[], v: EditorView) {
    v.update(trs);
    const p = this.panes.get(id);
    if (p?.buf) {
      // Other panes on the same buffer get the same changes, outside their undo history.
      // shortcut: undo is per pane, so `u` in one pane doesn't undo edits made in the other.
      for (const tr of trs) {
        if (!tr.docChanged || tr.annotation(synced)) continue;
        for (const [oid, o] of this.panes)
          if (oid !== id && o.buf === p.buf)
            o.view!.dispatch({ changes: tr.changes, annotations: [synced.of(true), Transaction.addToHistory.of(false)] });
      }
      p.buf.state = v.state; // the docs are equal now; keep the state of the pane that was typed in
    }
    if (id === this.active) this.emit();
  }
}
