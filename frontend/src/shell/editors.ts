import { EditorState, Transaction, Annotation } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";
import type { Files } from "../core/backend";
import { Buffers, isDirty, type Buffer } from "../core/buffers";
import { createState, editorExtensions } from "../editor/editor";

export interface Status {
  pane: number;
  path: string | null;
  dirty: boolean;
  mode: string;
  line: number;
  col: number;
  lines: number;
}

interface Pane { view: EditorView; buf: Buffer | null; mode: string }

// Marks changes copied from another pane showing the same buffer, so they aren't copied back.
const synced = Annotation.define<boolean>();
const RECENT_MAX = 100;

// The editor panes of one workspace and the buffers they show. Layout (where panes sit) is the workbench's job.
export class Editors {
  readonly buffers: Buffers;
  private panes = new Map<number, Pane>();
  private mru: string[] = []; // buffers, most recent first
  private recentKey: string;
  active = 0;

  constructor(files: Files, root: string, private onStatus: (s: Status) => void) {
    this.buffers = new Buffers(files, createState);
    this.recentKey = `ayaz.recent:${root}`;
  }

  // Creates the view for pane `id`. A split passes `from`, and the new pane shows the same buffer.
  attach(id: number, parent: HTMLElement, from?: number) {
    const view = new EditorView({
      parent,
      state: EditorState.create({ extensions: editorExtensions() }),
      dispatchTransactions: (trs, v) => this.dispatch(id, trs, v),
    });
    const p: Pane = { view, buf: null, mode: "normal" };
    this.panes.set(id, p);
    if (!this.panes.has(this.active)) this.active = id;
    view.contentDOM.addEventListener("focus", () => this.setActive(id));
    const src = from === undefined ? undefined : this.panes.get(from)?.buf;
    if (src) this.show(id, src);
    else this.watchMode(id);
  }

  detach(id: number) {
    this.panes.get(id)?.view.destroy();
    this.panes.delete(id);
  }

  focus(id: number) {
    this.panes.get(id)?.view.focus();
    this.setActive(id);
  }

  current(): Buffer | null { return this.panes.get(this.active)?.buf ?? null; }

  async open(path: string, id = this.active) {
    this.show(id, await this.buffers.open(path));
  }

  // Re-reads the active buffer from disk (`:e!`).
  async reload() {
    const b = this.current();
    if (b) this.show(this.active, await this.buffers.load(b.path));
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
    p.view.setState(b.state);
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
    getCM(p.view)?.on("vim-mode-change", (e: { mode: string }) => {
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
            o.view.dispatch({ changes: tr.changes, annotations: [synced.of(true), Transaction.addToHistory.of(false)] });
      }
      p.buf.state = v.state; // the docs are equal now; keep the state of the pane that was typed in
    }
    if (id === this.active) this.emit();
  }
}
