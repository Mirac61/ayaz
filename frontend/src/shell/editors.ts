import { EditorState, Transaction, Annotation, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { redo, undo, undoDepth } from "@codemirror/commands";
import { getCM } from "@replit/codemirror-vim";
import type { Files } from "../core/backend";
import { Buffers, diff, isDirty, type Buffer } from "../core/buffers";
import { setLspHost, formatBeforeSave, fileOps, toChanges, type WorkspaceEdit } from "../editor/lsp";
import { createState, editorExtensions, isWrapped, setWrap, settingsEffects } from "../editor/editor";
import { cleanupChanges } from "../editor/cleanup";
import { isReading, linkAt, toggleReading } from "../editor/mdlive";
import { openTerminal, setTermZoom, termFontSize, termZoom, type TermHandle, type TermOptions } from "../terminal/terminal";
import { fsUrl, viewerFor, type ViewHandle } from "../core/viewers";
import "../viewers/image";
import "../viewers/pdf";
import { backend } from "../core/backend";
import { Jumps, type Spot } from "./jumps";
import { browsable } from "../editor/mdlive";
import { historyRoute } from "../editor/vim/setup";
import { breakpointLines, setLines as setBreakpointLines, toggleBreakpoint } from "../editor/breakpoints";
import { diffWith, headEffects, toggleDiff } from "../editor/gitgutter";
import { Waits } from "./waits";

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
// Closing a terminal's pane hides the terminal, like nvim's terminal buffers: the shell runs on, <Space>fb brings it back.
interface Pane {
  el: HTMLElement; view?: EditorView; term?: TermHandle; viewer?: ViewHandle; title?: string; buf: Buffer | null; mode: string;
  cmd?: string; // a terminal's command, "" for a shell
}

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
  bps: Record<string, number[]> = {}; // from the session: the breakpoints a file gets when it loads again
  private jumps = new Map<number, Jumps>(); // per pane: back/forward across files
  private navigating = false; // nav() is opening a file: not a new jump
  private closed: string[] = []; // closed tabs, last on top (Cmd+Shift+T)
  private waits = new Waits(); // `ayaz --wait`: files somebody waits to see closed
  private hidden: { term: TermHandle; box: HTMLElement; title: string; cmd: string }[] = []; // terminals without a pane
  private holder: HTMLElement | null = null; // keeps hidden terminals in the document, undrawn
  private terms = 0; // numbers the terminals: "shell 1", "lazygit 2"
  onTermExit: (id: number) => void = () => {}; // the shell in split pane id ended (the panel passes its own onExit)
  // Per buffer: the pane behind each undo (and redo) step, newest last. Each pane keeps its own CM6 history,
  // so u runs in the pane that made the latest step, and the change syncs to the others (like nvim's one undo tree).
  private steps = new WeakMap<Buffer, { undo: number[]; redo: number[] }>();
  active = 0;

  constructor(private files: Files, private root: string, private wsId: string, private onStatus: (s: Status) => void) {
    this.buffers = new Buffers(files, (path, doc) => createState(path, doc, wsId, root));
    setLspHost(wsId, { display: (path) => this.display(path), apply: async (e) => (await this.applyEdit(e)).length > 0 });
    this.recentKey = `ayaz.recent:${root}`;
  }

  // Creates the view for pane `id`. A split passes `from`, and the new pane shows the same buffer.
  // With term, the pane runs a terminal instead.
  attach(id: number, parent: HTMLElement, from?: number, term?: TermOptions) {
    if (term) {
      // Its own box, so a hidden terminal can move to another pane.
      const box = document.createElement("div");
      box.className = "pane-term";
      parent.append(box);
      // let: openTerminal reports its first mode before the handle exists
      let handle: TermHandle | undefined = undefined;
      handle = openTerminal(box, {
        ...term,
        onMode: (m) => this.termMode(handle, m),
        onExit: () => this.termExited(handle!, term.onExit),
      });
      this.showTerm(id, parent, { term: handle, box, title: `${term.cmd ?? "shell"} ${++this.terms}`, cmd: term.cmd ?? "" });
      return;
    }
    const view = new EditorView({
      parent,
      state: EditorState.create({ extensions: editorExtensions() }),
      dispatchTransactions: (trs, v) => this.dispatch(id, trs, v),
    });
    historyRoute.set(view, (r) => this.historyIn(id, r));
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
    if (p?.buf) this.forgetSteps(id, p.buf);
    p?.view?.destroy();
    if (p?.term && closing && id > 0) this.hide(p);
    else p?.term?.dispose();
    p?.viewer?.dispose();
    p?.el.querySelector(":scope > .pane-body")?.remove();
    p?.el.querySelector(":scope > .pane-term")?.remove(); // an ended terminal's box (a hidden one has moved out)
    this.panes.delete(id);
    if (closing) {
      this.pushClosed(...(this.tabs.get(id) ?? []));
      this.tabs.delete(id);
      this.jumps.delete(id);
    }
    this.checkWaits();
  }

  // Resolves once no pane shows path any more (`:q`, `:wq`, another file in its place).
  whenClosed(path: string): Promise<void> {
    return new Promise((done) => this.waits.add(path, done));
  }

  private checkWaits() {
    this.waits.check((path) => [...this.panes.values()].some((p) => (p.buf?.path ?? p.title) === path));
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

  // The folder the terminal in pane id reported with OSC 7, "" if it isn't one or hasn't said.
  termCwd(id = this.active) { return this.panes.get(id)?.term?.cwd() ?? ""; }
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
    if (path.startsWith("term://")) return this.unhide(path.slice("term://".length), id);
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
    if (fresh) {
      void this.loadHead(path);
      const lines = this.bps[path];
      if (lines?.length) b.state = b.state.update({ effects: setBreakpointLines.of(lines) }).state;
    }
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

  // A language server's edit (rename, code action) applied like typing. Like :Replace, buffers that were clean
  // are saved and dirty ones stay unsaved; files outside the folder are read-only and skipped. Files are created,
  // renamed and deleted (to the trash) in the edit's order; a rename or delete stops at a file with unsaved changes.
  // Returns the changed paths.
  async applyEdit(edit: WorkspaceEdit): Promise<string[]> {
    const done: string[] = [];
    const unsaved = (path: string) => {
      const d = this.buffers.dirty().find((b) => b.path === path || b.path.startsWith(path + "/"));
      if (d) throw new Error(`"${d.path}" has unsaved changes: save first (:w)`);
    };
    for (const op of fileOps(this.root, edit)) {
      if (op.kind === "create") {
        await this.files.create(op.path, false).catch(() => {}); // there already: the edits that follow fill it
        done.push(op.path);
        continue;
      }
      if (op.kind === "rename") {
        unsaved(op.from);
        await this.files.rename(op.from, op.to);
        await this.moved(op.from, op.to);
        done.push(op.to);
        continue;
      }
      if (op.kind === "delete") {
        unsaved(op.path);
        await this.files.trash(op.path);
        await this.moved(op.path, null);
        done.push(op.path);
        continue;
      }
      const { path, edits } = op;
      const before = await this.buffers.open(path);
      if (before.state.readOnly) continue;
      const wasDirty = isDirty(before);
      const b = await this.edit(path, toChanges(before.state.doc, edits));
      if (!wasDirty) await this.buffers.save(b);
      done.push(path);
    }
    return done;
  }

  // What the session keeps: the file per pane (not terminals), the tabs, and every loaded buffer's cursor.
  snapshot() {
    const panes: Record<number, string> = {};
    const terms: Record<number, string> = {};
    for (const [id, p] of this.panes) {
      const path = p.buf?.path ?? (p.viewer ? p.title : undefined);
      if (path && id > 0) panes[id] = path;
      if (p.term && id > 0) terms[id] = p.cmd ?? "";
    }
    const cursors: Record<string, number> = {}, breakpoints: Record<string, number[]> = {};
    for (const b of this.buffers.list()) {
      cursors[b.path] = b.state.selection.main.head;
      breakpoints[b.path] = breakpointLines(b.state);
    }
    return { panes, terms, tabs: Object.fromEntries(this.tabs), active: this.active, cursors, breakpoints };
  }

  // Session restore: the pane's tabs before its file opens (which adds to them).
  setTabList(id: number, list: string[]) {
    this.tabs.set(id, [...list]);
    this.renderTabs(id);
  }

  pathOf(id: number) { return this.panes.get(id)?.buf?.path; }

  // Every loaded buffer's breakpoints (files without any are left out): what the debugger is given.
  breakpoints(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const b of this.buffers.list()) {
      const lines = breakpointLines(b.state);
      if (lines.length) out[b.path] = lines;
    }
    return out;
  }

  // <Space>db: a breakpoint on the active editor's cursor line, or none any more. null: no editor pane.
  toggleBreakpoint(): boolean | null {
    const v = this.activeView();
    if (!v) return null;
    const on = toggleBreakpoint(v);
    this.emit(); // the session notices
    return on;
  }

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

  // Trims line ends and the file's end before :w, as one undoable change. Not for read-only (library) files.
  cleanup() {
    const v = this.panes.get(this.active)?.view, b = this.current();
    if (!v || !b || v.state.readOnly) return;
    const changes = cleanupChanges(v.state.doc, b.path.endsWith(".md"));
    if (changes.length) v.dispatch({ changes, userEvent: "cleanup" });
  }

  wrapped() {
    const v = this.panes.get(this.active)?.view;
    return !!v && isWrapped(v.state);
  }

  // Line wrap on or off in every pane and loaded buffer (and for files opened later).
  setWrap(on: boolean) {
    const effects = setWrap(on);
    const shown = new Set<Buffer>();
    for (const p of this.panes.values()) {
      if (!p.view) continue;
      p.view.dispatch({ effects });
      if (p.buf) shown.add(p.buf);
    }
    for (const b of this.buffers.list()) if (!shown.has(b)) b.state = b.state.update({ effects }).state;
  }

  // settings.json was saved: indent and wrap for every loaded buffer, font for every terminal (hidden ones too).
  settingsChanged() {
    const shown = new Set<Buffer>();
    for (const p of this.panes.values()) {
      p.term?.setFont();
      if (!p.view || !p.buf) continue;
      p.view.dispatch({ effects: settingsEffects(p.buf.path) });
      shown.add(p.buf);
    }
    for (const b of this.buffers.list()) if (!shown.has(b)) b.state = b.state.update({ effects: settingsEffects(b.path) }).state;
    for (const h of this.hidden) h.term.setFont();
  }

  // Re-reads the active buffer from disk (`:e!`).
  async reload() {
    const b = this.current();
    if (!b) return;
    this.show(this.active, await this.buffers.load(b.path));
    void this.loadHead(b.path);
  }

  // Fetches the file's text at HEAD and in the index for the git gutter, without holding up the open. Library files have none.
  private async loadHead(path: string) {
    if (path.startsWith("/")) return;
    const [h, staged] = await Promise.all([
      this.files.gitHead(path).catch(() => null), this.files.gitIndex(path).catch(() => null),
    ]);
    const b = this.buffers.get(path);
    if (!b) return;
    const text = (f: typeof h) => (f?.tracked ? Text.of(f.text.split("\n")) : null);
    const effects = headEffects(b.state, text(h), text(staged));
    const shown = [...this.panes.values()].filter((p) => p.buf === b);
    for (const p of shown) p.view!.dispatch({ effects }); // dispatch() keeps b.state in step
    if (!shown.length) b.state = b.state.update({ effects }).state;
  }

  // <Space>gd in the active editor; false when there is nothing to compare with.
  toggleDiff() {
    const v = this.activeView();
    return !!v && toggleDiff(v);
  }

  // <Space>fh: the active editor against an older text of its file; false without an editor.
  diffWith(original: Text) {
    const v = this.activeView();
    if (v) diffWith(v, original);
    return !!v;
  }

  // HEAD moved (a commit, checkout): every loaded buffer compares against the new HEAD.
  gitChanged() {
    for (const b of this.buffers.list()) void this.loadHead(b.path);
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
    if (p.buf && p.buf !== b) this.forgetSteps(id, p.buf); // its view takes the other buffer's history
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
    this.checkWaits();
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

  // Terminal zoom: d px more for every terminal (shown or hidden), 0 back to the size from settings.json.
  zoomTerms(d: number): number {
    setTermZoom(d ? termZoom() + d : 0);
    for (const p of this.panes.values()) p.term?.setFont();
    for (const h of this.hidden) h.term.setFont();
    return termFontSize();
  }

  // Hidden terminals by name, for the buffer list.
  hiddenTerms() { return this.hidden.map((h) => `term://${h.title}`); }

  // :q! on a terminal: the shell ends instead of hiding.
  killTerm(id: number) {
    const p = this.panes.get(id);
    p?.term?.dispose();
    if (p) p.term = undefined;
  }

  // The folder closes: hidden shells go with it.
  dropHidden() {
    for (const h of this.hidden.splice(0)) h.term.dispose();
    this.holder?.remove();
  }

  private showTerm(id: number, el: HTMLElement, h: { term: TermHandle; box: HTMLElement; title: string; cmd: string }) {
    el.append(h.box);
    const mode = h.box.dataset.mode ?? "terminal";
    this.panes.set(id, { el, term: h.term, buf: null, mode, title: h.title, cmd: h.cmd });
    this.renderTabs(id);
    el.addEventListener("focusin", () => this.panes.get(id)?.term === h.term && this.setActive(id));
    this.focus(id);
  }

  private hide(p: Pane) {
    if (!this.holder) {
      this.holder = document.createElement("div");
      this.holder.style.display = "none";
      document.body.append(this.holder);
    }
    const box = p.el.querySelector<HTMLElement>(":scope > .pane-term")!;
    this.holder.append(box);
    this.hidden.push({ term: p.term!, box, title: p.title!, cmd: p.cmd ?? "" });
  }

  // Shows hidden terminal `title` in pane id, in place of what it showed (a terminal there is hidden in turn).
  private unhide(title: string, id: number): number {
    const i = this.hidden.findIndex((h) => h.title === title);
    const p = this.panes.get(id);
    if (i < 0) throw new Error(`No terminal "${title}"`);
    if (!p) throw new Error("No pane to show it in");
    const [h] = this.hidden.splice(i, 1);
    this.detach(id, !!p.term);
    this.showTerm(id, p.el, h);
    return id;
  }

  private termMode(t: TermHandle | undefined, m: string) {
    if (!t) return; // the first mode, from inside openTerminal: showTerm reads it from the box
    const id = [...this.panes].find(([, p]) => p.term === t)?.[0];
    const p = id === undefined ? undefined : this.panes.get(id);
    if (!p) return;
    p.mode = m;
    if (id === this.active) this.emit();
  }

  // A shell ended: a hidden one leaves the list; a shown one closes its pane (or the panel, through its own onExit).
  private termExited(t: TermHandle, onExit?: () => void) {
    const h = this.hidden.findIndex((x) => x.term === t);
    if (h >= 0) {
      const [gone] = this.hidden.splice(h, 1);
      gone.term.dispose();
      gone.box.remove();
      return;
    }
    if (onExit) return onExit();
    const id = [...this.panes].find(([, p]) => p.term === t)?.[0];
    if (id !== undefined) this.onTermExit(id);
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

  // u or <C-r> in pane id: false lets Vim undo in this pane, as it would anyway.
  private historyIn(id: number, redoing: boolean): boolean {
    const b = this.panes.get(id)?.buf;
    const list = b && (redoing ? this.steps.get(b)?.redo : this.steps.get(b)?.undo);
    const owner = list?.[list.length - 1];
    const o = owner === undefined || owner === id ? undefined : this.panes.get(owner);
    if (!o?.view || o.buf !== b) return false;
    (redoing ? redo : undo)(o.view);
    this.panes.get(id)!.view!.dispatch({ selection: { anchor: o.view.state.selection.main.head } });
    return true;
  }

  private forgetSteps(id: number, b: Buffer) {
    const s = this.steps.get(b);
    if (s) for (const l of [s.undo, s.redo]) l.splice(0, l.length, ...l.filter((x) => x !== id));
  }

  // An edit adds a step for pane id (CM6 may merge it into the last one: then the depth stays), undo and redo move one.
  private trackSteps(id: number, b: Buffer, trs: readonly Transaction[], depth: number, state: EditorState) {
    let s = this.steps.get(b);
    if (!s) this.steps.set(b, (s = { undo: [], redo: [] }));
    const move = (from: number[], to: number[]) => {
      const i = from.lastIndexOf(id);
      if (i >= 0) from.splice(i, 1);
      to.push(id);
    };
    if (trs.some((t) => t.isUserEvent("undo"))) move(s.undo, s.redo);
    else if (trs.some((t) => t.isUserEvent("redo"))) move(s.redo, s.undo);
    else if (undoDepth(state) > depth) {
      s.undo.push(id);
      s.redo.length = 0;
    }
  }

  private dispatch(id: number, trs: readonly Transaction[], v: EditorView) {
    const depth = undoDepth(v.state);
    v.update(trs);
    const p = this.panes.get(id);
    if (p?.buf && trs.some((t) => t.docChanged && !t.annotation(synced))) this.trackSteps(id, p.buf, trs, depth, v.state);
    if (p?.buf) {
      // Other panes on the same buffer get the same changes, outside their undo history (see steps).
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
