import { EditorState, Transaction, Annotation } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";
import type { Files } from "../core/backend";
import { Buffers, diff, isDirty, type Buffer } from "../core/buffers";
import { setLspHost, formatBeforeSave } from "../editor/lsp";
import { createState, editorExtensions } from "../editor/editor";
import { isReading, linkAt, toggleReading } from "../editor/mdlive";
import { openTerminal, type TermHandle, type TermOptions } from "../terminal/terminal";
import { fsUrl, viewerFor, type ViewHandle } from "../core/viewers";
import "../viewers/image";
import "../viewers/pdf";
import { backend } from "../core/backend";
import { Jumps, type Spot } from "./jumps";
import { browsable } from "../editor/mdlive";

export interface Status {
  pane: number;
  path: string | null;
  dirty: boolean;
  mode: string;
  line: number;
  col: number;
  lines: number;
  info?: string; // a viewer's status (zoom, size) in place of line:col
}

// A pane shows an editor (view), a terminal (term) or a viewer for images and the like (title is its file).
// shortcut: a terminal lives and dies with its pane, unlike nvim's terminal buffers; add hidden terminals if wanted.
interface Pane { el: HTMLElement; view?: EditorView; term?: TermHandle; viewer?: ViewHandle; title?: string; buf: Buffer | null; mode: string }

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
  private tabs = new Map<number, string[]>(); // per pane: files shown in it, in the order first shown
  private dirtyTabs = ""; // the dirty buffers' paths when the tabs were last drawn
  tabsOn = false; // set through setTabs
  cursors: Record<string, number> = {}; // from the session: where the cursor was when a file loads again
  private jumps = new Map<number, Jumps>(); // per pane: back/forward across files
  private navigating = false; // nav() is opening a file: not a new jump
  private closed: string[] = []; // closed tabs, last on top (Cmd+Shift+T)
  active = 0;

  constructor(files: Files, root: string, private wsId: string, private onStatus: (s: Status) => void) {
    this.buffers = new Buffers(files, (path, doc) => createState(path, doc, wsId, root));
    setLspHost(wsId, (path) => this.display(path));
    this.recentKey = `ayaz.recent:${root}`;
  }

  // Creates the view for pane `id`. A split passes `from`, and the new pane shows the same buffer.
  // With term, the pane runs a terminal instead.
  attach(id: number, parent: HTMLElement, from?: number, term?: TermOptions) {
    if (term) {
      const p: Pane = { el: parent, buf: null, mode: "terminal", title: term.cmd ?? "shell" };
      this.panes.set(id, p);
      this.renderTabs(id);
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
    view.scrollDOM.addEventListener("scroll", () => id === this.active && this.syncScroll(id));
    const fromPane = from === undefined ? undefined : this.panes.get(from);
    if (fromPane?.buf) this.show(id, fromPane.buf);
    else if (fromPane?.viewer) this.showViewer(id, fromPane.title!);
    else this.watchMode(id);
  }

  // closing: the pane goes away for good (not just swapping its content), so its tabs go too.
  detach(id: number, closing = false) {
    const p = this.panes.get(id);
    p?.view?.destroy();
    p?.term?.dispose();
    p?.viewer?.dispose();
    p?.el.querySelector(":scope > .pane-body")?.remove();
    this.panes.delete(id);
    if (closing) {
      this.pushClosed(...(this.tabs.get(id) ?? []));
      this.tabs.delete(id);
      this.jumps.delete(id);
    }
  }

  private pushClosed(...paths: string[]) {
    this.closed = [...this.closed.filter((p) => !paths.includes(p)), ...paths].slice(-50);
  }

  // Opens the tab closed last; false if there is none.
  async reopen(): Promise<boolean> {
    const path = this.closed.pop();
    if (path) await this.open(path);
    return !!path;
  }

  // Where pane id is: its file and cursor.
  private spot(id: number): Spot | null {
    const p = this.panes.get(id);
    const path = p?.buf?.path ?? (p?.viewer ? p.title : undefined);
    return path ? { path, pos: p?.view?.state.selection.main.head ?? 0 } : null;
  }

  // Back (-1) or forward (1) to the file shown before; false at the end.
  async nav(d: -1 | 1): Promise<boolean> {
    const id = this.active, here = this.spot(id);
    const to = here && this.jumps.get(id)?.go(d, here);
    if (!to) return false;
    this.navigating = true;
    try {
      const v = this.panes.get(await this.open(to.path, id))?.view;
      const pos = Math.min(to.pos, v?.state.doc.length ?? 0);
      v?.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    } finally {
      this.navigating = false;
    }
    return true;
  }

  // The optional tab bar (02-architecture): per pane, the files it showed. Click or gt/gT switch, <Space>bd drops one.
  setTabs(on: boolean) {
    this.tabsOn = on;
    for (const id of this.panes.keys()) this.renderTabs(id);
  }

  async tabMove(d: number) {
    const list = this.tabs.get(this.active) ?? [], cur = this.panes.get(this.active)?.buf?.path ?? this.panes.get(this.active)?.title;
    if (list.length < 2) return;
    const i = list.indexOf(cur ?? "");
    await this.open(list[(i + d + list.length) % list.length]);
  }

  // Drops the current file from the pane's tabs and shows its neighbor. The buffer itself stays loaded, so nothing is lost.
  async tabClose() {
    const id = this.active, p = this.panes.get(id);
    const cur = p?.buf?.path ?? (p?.viewer ? p.title : undefined);
    const list = this.tabs.get(id);
    if (!cur || !list) return;
    const i = list.indexOf(cur);
    list.splice(i, 1);
    this.pushClosed(cur);
    const next = list[Math.min(i, list.length - 1)];
    if (next) await this.open(next, id);
    else { this.replace(id); this.renderTabs(id); }
  }

  private addTab(id: number, path: string) {
    const list = this.tabs.get(id) ?? [];
    if (!list.includes(path)) list.push(path);
    this.tabs.set(id, list);
    this.renderTabs(id);
  }

  private renderTabs(id: number) {
    const p = this.panes.get(id);
    if (!p) return;
    let bar = p.el.querySelector<HTMLElement>(":scope > .tabbar");
    if (!this.tabsOn || p.term) return void bar?.remove();
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "tabbar";
      bar.setAttribute("role", "tablist");
      p.el.prepend(bar);
    }
    const cur = p.buf?.path ?? (p.viewer ? p.title : undefined);
    bar.replaceChildren(...(this.tabs.get(id) ?? []).map((path) => {
      const t = document.createElement("button");
      t.className = path === cur ? "tab active" : "tab";
      t.setAttribute("role", "tab");
      t.setAttribute("aria-selected", String(path === cur));
      t.title = path;
      t.textContent = path.slice(path.lastIndexOf("/") + 1);
      const b = this.buffers.get(path);
      if (b && isDirty(b)) t.append(Object.assign(document.createElement("span"), { className: "dirty", title: "Modified" }));
      t.tabIndex = -1;
      t.addEventListener("mousedown", (e) => { e.preventDefault(); void this.open(path, id); });
      return t;
    }));
  }

  focus(id: number) {
    const p = this.panes.get(id);
    if (p?.view) p.view.focus();
    else if (p?.viewer) p.viewer.focus();
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

  // Markdown source and preview (the same buffer, one pane in the reading view) keep the same line at the top.
  // Only the active pane leads, so the scroll it causes in the other one doesn't come back.
  syncScroll(id: number) {
    const v = this.panes.get(id)?.view, b = this.panes.get(id)?.buf;
    if (!v || !b) return;
    for (const o of this.panes.values())
      if (o.buf === b && o.view !== v && isReading(o.view!.state) !== isReading(v.state)) o.view!.dispatch({ effects: v.scrollSnapshot() });
  }

  // Reading view in the active editor; false if it isn't a Markdown file.
  toggleReading(): boolean {
    const v = this.panes.get(this.active)?.view;
    return !!v && toggleReading(v) !== null;
  }

  current(): Buffer | null { return this.panes.get(this.active)?.buf ?? null; }

  // From a terminal pane, the file opens in the editor pane used last. Images and the like open in a viewer.
  async open(path: string, id = this.active): Promise<number> {
    const usable = (p?: Pane) => !!(p?.view || p?.viewer);
    if (this.isTerm(id)) id = usable(this.panes.get(this.lastEditor)) ? this.lastEditor : [...this.panes].find(([, p]) => usable(p))?.[0] ?? -1;
    if (!usable(this.panes.get(id))) throw new Error("No editor pane, split one off with :vsplit");
    const from = this.spot(id);
    if (from && from.path !== path && !this.navigating) {
      if (!this.jumps.has(id)) this.jumps.set(id, new Jumps());
      this.jumps.get(id)!.push(from);
    }
    if (viewerFor(path)) {
      this.showViewer(id, path);
      return id;
    }
    const fresh = !this.buffers.get(path);
    const b = await this.buffers.open(path);
    if (this.panes.get(id)!.viewer) this.replace(id); // back to an editor
    this.show(id, b);
    const at = this.cursors[path], v = this.panes.get(id)!.view!;
    if (fresh && at !== undefined) {
      const pos = Math.min(at, v.state.doc.length);
      v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    }
    return id;
  }

  private showViewer(id: number, path: string) {
    const el = this.panes.get(id)!.el;
    this.detach(id);
    const p: Pane = { el, buf: null, mode: "view", title: path };
    this.panes.set(id, p);
    // Viewers fill a body box, so the tab bar can sit above them.
    const body = document.createElement("div");
    body.className = "pane-body";
    el.append(body);
    p.viewer = viewerFor(path)!.mount(body, {
      url: fsUrl(this.wsId, path),
      onStatus: () => id === this.active && this.emit(),
      openURL: (u) => browsable(u) && void backend.openURL(u),
    });
    el.addEventListener("focusin", () => this.setActive(id));
    this.touch(path);
    this.addTab(id, path);
    this.focus(id);
  }

  // Opens path with the cursor at line (1-based) and col (UTF-16 units), centered: quickfix jumps.
  async openAt(path: string, line: number, col: number) {
    const v = this.panes.get(await this.open(path))?.view;
    if (!v) return;
    const l = v.state.doc.line(Math.min(Math.max(line, 1), v.state.doc.lines));
    const pos = Math.min(l.from + col, l.to);
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
  }

  // Changes a buffer like typing would (other panes follow, undo works), loading it first if needed.
  async edit(path: string, changes: { from: number; to: number; insert: string }[]) {
    const b = await this.buffers.open(path);
    const pane = [...this.panes.values()].find((p) => p.buf === b);
    if (pane?.view) pane.view.dispatch({ changes, userEvent: "input.replace" });
    else b.state = b.state.update({ changes, userEvent: "input.replace" }).state;
    this.emit();
    return b;
  }

  // What the session keeps: the file per pane (not terminals), the tabs, and every loaded buffer's cursor.
  snapshot() {
    const panes: Record<number, string> = {};
    for (const [id, p] of this.panes) {
      const path = p.buf?.path ?? (p.viewer ? p.title : undefined);
      if (path && id > 0) panes[id] = path;
    }
    const cursors: Record<string, number> = {};
    for (const b of this.buffers.list()) cursors[b.path] = b.state.selection.main.head;
    return { panes, tabs: Object.fromEntries(this.tabs), active: this.active, cursors };
  }

  // Session restore: the pane's tabs before its file opens (which adds to them).
  setTabList(id: number, list: string[]) {
    this.tabs.set(id, [...list]);
    this.renderTabs(id);
  }

  pathOf(id: number) { return this.panes.get(id)?.buf?.path; }

  // The view of the active pane, if it is an editor.
  activeView() { return this.panes.get(this.active)?.view ?? null; }

  // Shows path in an editor pane and returns its view (for LSP jumps across files).
  async display(path: string) {
    return this.panes.get(await this.open(path))?.view ?? null;
  }

  // Runs the language server's formatter on the active editor, if it has one.
  format() {
    const v = this.panes.get(this.active)?.view;
    return v ? formatBeforeSave(v) : Promise.resolve();
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
    for (const p of this.panes.values()) if (p.viewer && hit(p.title!)) p.viewer.reload?.();
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

  // A file or folder was renamed to `to`, or trashed (to null). Panes showing it follow, or turn empty;
  // tabs and recent files are rewritten. The caller makes sure no affected buffer is dirty.
  async moved(from: string, to: string | null) {
    const map = (p: string) => (p === from || p.startsWith(from + "/") ? (to === null ? null : to + p.slice(from.length)) : p);
    for (const [id, list] of this.tabs) this.tabs.set(id, list.map(map).filter((p): p is string => p !== null));
    this.mru = this.mru.map(map).filter((p): p is string => p !== null);
    try {
      localStorage.setItem(this.recentKey, JSON.stringify(this.recent().map(map).filter((p) => p !== null)));
    } catch { /* recent files are a convenience */ }
    for (const [id, p] of this.panes) {
      const shown = p.buf?.path ?? (p.viewer ? p.title : undefined);
      if (shown === undefined || map(shown) === shown) continue;
      const next = map(shown);
      this.navigating = true; // the same file under a new name, no jump
      try {
        if (next) await this.open(next, id);
        else this.replace(id);
      } finally {
        this.navigating = false;
      }
      this.renderTabs(id);
    }
    for (const b of this.buffers.list()) if (map(b.path) !== b.path) this.buffers.drop(b.path);
    this.emit();
  }

  show(id: number, b: Buffer) {
    // `:e!` creates a new Buffer object; other panes still showing the old one switch too.
    for (const [oid, o] of this.panes) if (oid === id || o.buf?.path === b.path && o.buf !== b) this.setBuf(oid, b);
    this.touch(b.path);
    this.addTab(id, b.path);
    this.focus(id);
  }

  private setBuf(id: number, b: Buffer) {
    const p = this.panes.get(id)!;
    p.buf = b;
    p.view!.setState(b.state);
    if (isReading(b.state)) toggleReading(p.view!); // a preview pane's reading view stays in that pane
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
    // Every change of a buffer's dirty state ends in emit(), so the dot in the tabs follows from here.
    const dirty = this.tabsOn ? this.buffers.dirty().map((b) => b.path).join("\n") : "";
    if (dirty !== this.dirtyTabs) {
      this.dirtyTabs = dirty;
      for (const id of this.panes.keys()) this.renderTabs(id);
    }
    const p = this.panes.get(this.active);
    if (!p) return;
    if (p.viewer) {
      return this.onStatus({ pane: this.active, path: p.title!, dirty: false, mode: p.mode, line: 1, col: 1, lines: 1, info: p.viewer.status() });
    }
    if (!p.view) {
      return this.onStatus({ pane: this.active, path: `term://${p.title}`, dirty: false, mode: p.mode, line: 1, col: 1, lines: 1 });
    }
    const st = p.view.state, head = st.selection.main.head, l = st.doc.lineAt(head);
    this.onStatus({
      pane: this.active,
      path: p.buf?.path ?? null,
      dirty: p.buf ? isDirty(p.buf) : false,
      mode: isReading(st) ? "read" : p.mode,
      line: l.number,
      col: head - l.from + 1,
      lines: st.doc.lines,
    });
  }

  private setActive(id: number) {
    if (!this.panes.has(id)) return;
    this.active = id;
    if (this.panes.get(id)!.view || this.panes.get(id)!.viewer) this.lastEditor = id;
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
