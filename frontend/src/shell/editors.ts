import { startDrag } from "./dnd";
import { EditorState, Transaction, Annotation, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { redo, undo, undoDepth } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { getCM, Vim } from "@replit/codemirror-vim";
import type { Files } from "../core/backend";
import { Buffers, diff, isDirty, isVirtual, type Buffer } from "../core/buffers";
import { setLspHost, formatBeforeSave, fileOps, toChanges, type WorkspaceEdit } from "../editor/lsp";
import { createState, editorExtensions, isProse, isWrapped, setWrap, settingsEffects, spellchecking, spellcheckAttr, noSpellcheckAttr } from "../editor/editor";
import { cleanupChanges } from "../editor/cleanup";
import { isReading, linkAt, toggleReading } from "../editor/mdlive";
import { openTerminal, setTermZoom, termFontSize, termZoom, type TermHandle, type TermOptions } from "../terminal/terminal";
import { BROWSER, PREVIEW, fsUrl, viewerFor, type ViewHandle } from "../core/viewers";
import "../viewers/browser";
import "../viewers/html";
import "../viewers/image";
import "../viewers/pdf";
import { backend } from "../core/backend";
import { Jumps, type Spot } from "./jumps";
import { browsable } from "../editor/mdlive";
import { historyRoute, viewPath } from "../editor/vim/setup";
import {
  breakpoints as breakpointsOf, getBreakpoint as getBreakpointOf,
  setBreakpoint as setBreakpointOn, setBreakpoints as setBreakpointLines, toggleBreakpoint,
  type Breakpoint,
} from "../editor/breakpoints";
import { setDebugLine } from "../editor/debugline";
import { diffWith, headEffects, toggleDiff } from "../editor/gitgutter";
import { setEditorConfig } from "../core/editorconfig";
import { countWords, selectionSize } from "../core/words";
import { searchCount } from "../core/searchcount";
import { blameText, clearBlame, showBlame } from "../editor/blame";
import { scopesAt } from "../editor/vim/structure";
import { header } from "../editor/sticky";
import { Waits } from "./waits";
import { UndoSteps } from "./undoSteps";
import { HiddenTerms } from "./terminals";
import { settings } from "../core/settings";
import { extOf } from "../lang/registry";
import { DOCS, docText } from "../docs/docsData";

export interface Status {
  pane: number;
  path: string | null;
  dirty: boolean;
  mode: string;
  line: number;
  col: number;
  lines: number;
  eol?: "LF" | "CRLF";
  indent?: string; // "Tabs" or "Spaces 4"
  words?: number; // prose files only (Markdown, text, Typst, LaTeX)
  recording?: string; // the register of the macro being recorded ("q" for qq)
  search?: string; // "3/12" for Vim's last search
  selected?: string; // the selection's size, "3 lines"; absent when nothing is selected
  info?: string; // a viewer's status (zoom, size) in place of line:col
  scopes?: { at: number; text: string }[]; // breadcrumb AST scopes
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
// The register a macro is being recorded into (qq … q), undefined when none.
const recordingRegister = () => {
  const m = Vim.getVimGlobalState_().macroModeState;
  return m.isRecording ? m.latestRegister ?? "" : undefined;
};
const TERM = "term://"; // a terminal's tab, next to the files'
const isTermTab = (t: string) => t.startsWith(TERM);

// The panes of one workspace (editors and terminals) and the buffers they show. Layout (where panes sit) is the workbench's job.
// The debugger's output: a buffer without a file (core/buffers `virtual`), opened like any path.
export const OUTPUT = "debug://output";

// Pane id of the bottom panel; split panes count up from 1.
export const PANEL = -1;

export class Editors {
  readonly buffers: Buffers;
  private panes = new Map<number, Pane>();
  private mru: string[] = []; // buffers, most recent first
  private recentKey: string;
  private lastEditor = 0; // where files open while a terminal pane is active
  private tabs = new Map<number, string[]>(); // per pane: files shown in it, in the order first shown
  private recording: string | undefined; // what the last status said about macro recording
  private dirtyTabs = ""; // the dirty buffers' paths when the tabs were last drawn
  tabsOn = true; // set through setTabs
  cursors: Record<string, number> = {}; // from the session: where the cursor was when a file loads again
  bps: Record<string, Breakpoint[]> = {}; // from the session: the breakpoints a file gets when it loads again
  onBreakpointsChanged?: (path: string, bps: Breakpoint[]) => void;
  private jumps = new Map<number, Jumps>(); // per pane: back/forward across files
  private navigating = false; // nav() is opening a file: not a new jump
  private closed: string[] = []; // closed tabs, last on top (Cmd+Shift+T)
  private waits = new Waits(); // `ayaz --wait`: files somebody waits to see closed
  private hidden = new HiddenTerms();
  private terms = 0; // numbers the terminals: "shell 1", "lazygit 2"
  private lastEdits = new Map<string, number>(); // path → timestamp in ms when buffer was last modified
  onTermExit: (id: number) => void = () => {}; // the shell in split pane id ended, or its last tab closed: the pane closes (the panel passes its own onExit)
  onPlus: (at: DOMRect, id: number) => void = () => {}; // the + in pane id's tab bar, at the button
  onTabMenu: (at: { x: number; y: number }, path: string, id: number) => void = () => {}; // right click on a tab
  private steps = new UndoSteps(); // see there: u runs in the pane that made the latest step
  active = 0;

  // The root .editorconfig, read before the first buffer is made. Missing or unreadable: none.
  private editorConfig: Promise<void>;
  private loadEditorConfig() {
    // Looked up in the folder's listing first: reading a missing file would log an error in the console.
    return this.files.list("").then(
      (es) => (es.some((e) => e.name === ".editorconfig" && !e.dir) ? this.files.readText(".editorconfig") : { content: "" }),
    ).then((f) => setEditorConfig(f.content), () => setEditorConfig(""));
  }

  constructor(private files: Files, private root: string, private wsId: string, private onStatus: (s: Status) => void) {
    this.editorConfig = this.loadEditorConfig();
    this.buffers = new Buffers(files, async (path, doc) => { await this.editorConfig; return createState(path, doc, wsId, root); });
    setLspHost(wsId, { display: (path) => this.display(path), apply: async (e) => (await this.applyEdit(e)).length > 0 });
    this.recentKey = `ayaz.recent:${root}`;
  }

  private autoBlame = (() => {
    try { return localStorage.getItem("ayaz.inlineBlame") !== "off"; } catch { return true; }
  })();
  private blameTimer: ReturnType<typeof setTimeout> | undefined;

  toggleAutoBlame(): boolean {
    this.autoBlame = !this.autoBlame;
    try { localStorage.setItem("ayaz.inlineBlame", this.autoBlame ? "on" : "off"); } catch { /* a convenience */ }
    if (!this.autoBlame) {
      clearTimeout(this.blameTimer);
      const v = this.activeView();
      if (v) clearBlame(v);
    } else {
      this.scheduleBlame();
    }
    return this.autoBlame;
  }

  private scheduleBlame() {
    clearTimeout(this.blameTimer);
    if (!this.autoBlame) return;
    const p = this.panes.get(this.active);
    if (!p?.view || !p.buf || p.buf.path.startsWith("/") || isVirtual(p.buf.path)) return;
    const v = p.view, b = p.buf;
    const head = v.state.selection.main.head;
    const line = v.state.doc.lineAt(head).number;
    this.blameTimer = setTimeout(async () => {
      if (this.activeView() !== v || v.state.selection.main.head !== head) return;
      const doc = isDirty(b) ? v.state.doc.toString() : "";
      const info = await this.files.gitBlame(b.path, line, doc).catch(() => null);
      if (!info || this.activeView() !== v || v.state.selection.main.head !== head) return;
      showBlame(v, blameText(info));
    }, 400);
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
    viewPath.set(view, () => this.panes.get(id)?.buf?.path);
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
  // keepShell: the pane shows something else now, its terminal's shell runs on hidden (its tab brings it back).
  detach(id: number, closing = false, keepShell = false) {
    const p = this.panes.get(id);
    if (p?.buf) this.steps.forget(id, p.buf);
    p?.view?.destroy();
    if (p?.term && (closing || keepShell) && id > 0) this.hide(p);
    else p?.term?.dispose();
    p?.viewer?.dispose();
    p?.el.querySelector(":scope > .pane-body")?.remove();
    p?.el.querySelector(":scope > .pane-term")?.remove(); // an ended terminal's box (a hidden one has moved out)
    this.panes.delete(id);
    if (closing) {
      this.pushClosed(...(this.tabs.get(id) ?? []).filter((t) => !isTermTab(t)));
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
    const list = this.tabs.get(this.active) ?? [], cur = this.currentTab(this.active);
    if (list.length < 2) return;
    const i = list.indexOf(cur ?? "");
    await this.open(list[(i + d + list.length) % list.length]);
  }

  tabPaths(id: number): string[] { return [...(this.tabs.get(id) ?? [])]; }

  // Drops a file (default: the current one) from the pane's tabs and shows its neighbor. The buffer itself stays
  // loaded, so nothing is lost.
  async tabClose(path?: string, id = this.active) {
    const cur = this.currentTab(id);
    const list = this.tabs.get(id), target = path ?? cur;
    if (!target || !list || !list.includes(target)) return;
    const i = list.indexOf(target);
    list.splice(i, 1);
    if (isTermTab(target)) {
      // A terminal's tab ends its shell: the shown one with its pane's content, a hidden one with its box.
      if (target === cur) this.replace(id);
      else this.hidden.kill(target.slice(TERM.length));
    } else this.pushClosed(target);
    if (target !== cur) return this.renderTabs(id);
    const next = list[Math.min(i, list.length - 1)];
    if (next) await this.open(next, id);
    else { this.onTermExit(id); this.renderTabs(id); } // the last tab closes its pane, unless it is the only one
  }

  // The tab the pane shows: a file, a viewer's file or "term://title".
  currentTab(id: number): string | undefined {
    const p = this.panes.get(id);
    return p?.buf?.path ?? (p?.viewer ? p.title : p?.term ? `${TERM}${p.title}` : undefined);
  }

  private addTab(id: number, path: string) {
    const list = this.tabs.get(id) ?? [];
    if (!list.includes(path)) list.push(path);
    this.tabs.set(id, list);
    this.renderTabs(id);
  }

  // The button at the top right of a Markdown or SVG pane: rendered view and source.
  private renderToggle(id: number, p: Pane) {
    const path = this.currentTab(id) ?? "";
    let btn = p.el.querySelector<HTMLElement>(":scope > .render-toggle");
    if (!/\.(md|svg)$/.test(path)) return void btn?.remove();
    if (btn) return;
    btn = Object.assign(document.createElement("button"), {
      type: "button", className: "render-toggle", title: "Rendered view / source",
    });
    btn.setAttribute("aria-label", "Toggle rendered view and source");
    btn.tabIndex = -1;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.setActive(id);
      this.toggleRendered();
    });
    p.el.append(btn);
  }

  private renderTabs(id: number) {
    const p = this.panes.get(id);
    if (!p) return;
    this.renderToggle(id, p);
    const list = this.tabs.get(id) ?? [];
    let bar = p.el.querySelector<HTMLElement>(":scope > .tabbar:not(.ghost)");
    if (!this.tabsOn || !list.length) return void bar?.remove();
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "tabbar";
      bar.setAttribute("role", "tablist");
      // A mouse wheel turns the strip sideways when the tabs overflow (a trackpad already does).
      bar.addEventListener("wheel", (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || bar!.scrollWidth <= bar!.clientWidth) return;
        bar!.scrollLeft += e.deltaY;
        e.preventDefault();
      }, { passive: false });
      p.el.prepend(bar);
    }
    const cur = this.currentTab(id);
    const plus = Object.assign(document.createElement("button"), {
      type: "button", className: "tab-plus", title: "New file, folder or terminal", textContent: "+",
    });
    plus.setAttribute("aria-label", "New");
    plus.tabIndex = -1;
    plus.addEventListener("mousedown", (e) => { e.preventDefault(); this.onPlus(plus.getBoundingClientRect(), id); });
    bar.replaceChildren(...list.map((path) => {
      const term = isTermTab(path);
      const web = path.startsWith(BROWSER);
      const active = path === cur, slash = term || web ? -1 : path.lastIndexOf("/");
      const t = document.createElement("button");
      t.type = "button";
      t.className = active ? "tab active" : "tab";
      t.setAttribute("role", "tab");
      t.setAttribute("aria-selected", String(active));
      t.title = path;
      const name = Object.assign(document.createElement("span"), { className: "tab-name" });
      const isHead = path.startsWith("head://");
      const real = isHead ? path.slice("head://".length) : path;
      const headSlash = isHead ? real.lastIndexOf("/") : slash;
      if (isHead) {
        const badge = document.createElement("span");
        badge.className = "tab-head-badge";
        badge.textContent = "HEAD";
        const base = Object.assign(document.createElement("span"), { className: "base", textContent: real.slice(headSlash + 1) });
        name.append(badge, base);
      } else if (active && slash >= 0) {
        const dir = document.createElement("span");
        dir.className = "dir";
        dir.textContent = path.slice(0, slash + 1);
        const base = Object.assign(document.createElement("span"), { className: "base", textContent: path.slice(slash + 1) });
        name.append(dir, base);
      } else {
        name.textContent = term ? path.slice(TERM.length) : web ? path.slice(BROWSER.length) : path.slice(slash + 1);
      }
      if (term) t.classList.add("term");
      t.append(name);
      const b = this.buffers.get(path);
      if (b && isDirty(b)) t.append(Object.assign(document.createElement("span"), { className: "dirty", title: "Modified" }));
      const x = Object.assign(document.createElement("span"), { className: "tab-close", title: "Close" });
      x.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); void this.tabClose(path, id); });
      t.append(x);
      t.tabIndex = -1;
      t.addEventListener("contextmenu", (e) => { e.preventDefault(); this.onTabMenu({ x: e.clientX, y: e.clientY }, path, id); });
      // Middle click closes, like in a browser.
      t.addEventListener("mousedown", (e) => {
        e.preventDefault();
        startDrag(e, path, id, term ? path.slice(TERM.length) : undefined);
        void (e.button === 1 ? this.tabClose(path, id) : this.open(path, id));
      });
      return t;
    }), plus);
    const scrollOpts = { inline: "nearest", block: "nearest", container: "nearest" } as ScrollIntoViewOptions;
    bar.querySelector(".active")?.scrollIntoView(scrollOpts);
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
  // The terminal whose title starts with `name`: in a pane (pane set) or hidden (a tab of some pane).
  termTitled(name: string): { title: string; pane?: number } | null {
    for (const [pane, p] of this.panes) if (p.term && p.title?.startsWith(name)) return { title: p.title, pane };
    const title = this.hidden.titles().find((t) => t.startsWith(name));
    return title ? { title } : null;
  }
  termTitle(id: number) { return this.panes.get(id)?.title ?? ""; }
  isTerm(id = this.active) { return !!this.panes.get(id)?.term; }

  // Returns the pane showing path, or having it as a tab, or null if not open.
  findPaneWithPath(path: string): number | null {
    for (const [id, p] of this.panes) {
      const pPath = this.pathOf(id);
      if (pPath === path || p.buf?.path === path || p.title === path || p.title === PREVIEW + path || (this.tabs.get(id) ?? []).includes(path)) return id;
    }
    return null;
  }

  viewOf(id: number): EditorView | null {
    return this.panes.get(id)?.view ?? null;
  }

  allPanes(): { id: number; path: string | null }[] {
    const res: { id: number; path: string | null }[] = [];
    for (const [id, p] of this.panes) {
      res.push({ id, path: p.buf?.path ?? null });
    }
    return res;
  }

  // An editor pane with no file: a new terminal takes it over instead of splitting.
  isEmpty(id = this.active) { const p = this.panes.get(id); return !!p?.view && !p.buf; }

  // Swaps what pane id shows: a terminal, or an empty editor without term.
  replace(id: number, term?: TermOptions, keepShell = false) {
    const p = this.panes.get(id);
    if (!p) return;
    const wasActive = id === this.active;
    this.detach(id, false, keepShell);
    this.attach(id, p.el, undefined, term);
    if (wasActive) this.focus(id);
  }

  // Vim is between commands (no count, operator or partial keys), so a key may start a leader sequence.
  vimIdle(id = this.active): boolean {
    const v = this.panes.get(id)?.view;
    const vim = v && (getCM(v)?.state.vim as { insertMode?: boolean; visualMode?: boolean; inputState?: { keyBuffer: string[]; operator: unknown } } | undefined);
    return !!vim && !vim.insertMode && !vim.visualMode && !vim.inputState?.keyBuffer.length && !vim.inputState?.operator;
  }

  // Runs a line like "w" or "%s/a/b/" in the active editor, as Vim's command line would.
  ex(line: string) {
    const v = this.panes.get(this.active)?.view, cm = v && getCM(v);
    if (cm) Vim.handleEx(cm as never, line);
  }

  // Ctrl-\ Ctrl-n in the active terminal.
  termNormal() { this.panes.get(this.active)?.term?.setMode("normal"); }

  // The link target under the active editor's cursor (gx, gf).
  linkAtCursor(): string | null {
    const v = this.panes.get(this.active)?.view;
    return v ? linkAt(v.state, v.state.selection.main.head) : null;
  }

  // The active editor's cursor line, 1-based.
  cursorLine(): number | null {
    const v = this.panes.get(this.active)?.view;
    return v ? v.state.doc.lineAt(v.state.selection.main.head).number : null;
  }

  // Markdown source and preview (the same buffer, one pane in the reading view) keep the same line at the top.
  // Diff split pairs (head://<path> and <path>) stay synchronized.
  // Only the active pane leads, so the scroll it causes in the other one doesn't come back.
  syncScroll(id: number) {
    const v = this.panes.get(id)?.view, b = this.panes.get(id)?.buf;
    if (!v || !b) return;
    for (const o of this.panes.values()) {
      if (!o.view || o.view === v) continue;
      if (o.buf === b && isReading(o.view.state) !== isReading(v.state)) {
        o.view.dispatch({ effects: v.scrollSnapshot() });
      } else if (o.buf && (b.path === `head://${o.buf.path}` || o.buf.path === `head://${b.path}`)) {
        o.view.scrollDOM.scrollTop = v.scrollDOM.scrollTop;
        o.view.scrollDOM.scrollLeft = v.scrollDOM.scrollLeft;
      }
    }
  }

  // Reading view in the active editor; false if it isn't a Markdown file.
  toggleReading(): boolean {
    const v = this.panes.get(this.active)?.view;
    return !!v && toggleReading(v) !== null;
  }

  // Returns whether the pane's editor is currently showing Markdown in reading view.
  isReading(id = this.active): boolean {
    const v = this.panes.get(id)?.view;
    return !!v && isReading(v.state);
  }

  // Rendered view and source: Markdown's reading view, or an SVG's image viewer and its text. False for other files.
  toggleRendered(): boolean {
    const p = this.panes.get(this.active), path = this.currentTab(this.active);
    if (!path?.endsWith(".svg")) return this.toggleReading();
    if (p?.viewer) void this.open(path, this.active, true);
    else this.showViewer(this.active, path); // shows the file on disk, unsaved edits stay in the buffer
    return true;
  }

  toggleSpellcheck(): boolean | null {
    const v = this.activeView();
    if (!v) return null;
    const cur = v.contentDOM.getAttribute("spellcheck") === "true";
    const next = !cur;
    v.dispatch({ effects: spellchecking.reconfigure(next ? spellcheckAttr : noSpellcheckAttr) });
    return next;
  }

  current(): Buffer | null { return this.panes.get(this.active)?.buf ?? null; }

  // From a terminal pane, the file opens in the editor pane used last. Images and the like open in a viewer.
  async open(path: string, id = this.active, source = false): Promise<number> {
    if (path.startsWith("term://")) return this.unhide(path.slice("term://".length), id);
    const usable = (p?: Pane) => !!(p?.view || p?.viewer);
    // A terminal in a pane with file tabs gives way to the file; one in a pane of its own sends it to the editor used last.
    const keepsFiles = (this.tabs.get(id) ?? []).some((t) => !isTermTab(t));
    // With no editor pane at all, the file opens beside the terminal, as a tab of its pane.
    if (this.isTerm(id) && !keepsFiles) id = usable(this.panes.get(this.lastEditor)) ? this.lastEditor : [...this.panes].find(([, p]) => usable(p))?.[0] ?? id;
    if (!usable(this.panes.get(id)) && !this.isTerm(id)) throw new Error("No editor pane, split one off with :vsplit");
    const from = this.spot(id);
    if (from && from.path !== path && !this.navigating) {
      if (!this.jumps.has(id)) this.jumps.set(id, new Jumps());
      this.jumps.get(id)!.push(from);
    }
    if (!source && viewerFor(path)) {
      this.showViewer(id, path);
      return id;
    }
    if (path.startsWith(DOCS)) await this.buffers.virtual(path, docText(path));
    const fresh = !this.buffers.get(path);
    const b = await this.buffers.open(path);
    if (fresh) {
      void this.loadHead(path);
      const lines = this.bps[path];
      if (lines?.length) b.state = b.state.update({ effects: setBreakpointLines.of(lines) }).state;
    }
    if (this.panes.get(id)!.viewer || this.isTerm(id)) this.replace(id, undefined, true); // back to an editor
    this.show(id, b);
    const at = this.cursors[path], v = this.panes.get(id)!.view!;
    if (fresh && at !== undefined) {
      const pos = Math.min(at, v.state.doc.length);
      v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    }
    if (path.startsWith(DOCS) && !isReading(v.state)) {
      toggleReading(v); // docs always read rendered, like a help page
    } else if (extOf(path) === "md") {
      const mode = settings().markdownReadingMode;
      if (mode === "always") {
        if (!isReading(v.state)) toggleReading(v);
      } else if (mode === "smart") {
        const timeoutSec = settings().markdownReadingTimeout ?? 300;
        const nowMs = Date.now();
        const fileMtimeMs = b.mtime > 0 ? b.mtime / 1000 : 0;
        const lastEditMs = this.lastEdits.get(path) ?? 0;
        const lastActiveMs = Math.max(fileMtimeMs, lastEditMs);
        const ageSec = lastActiveMs > 0 ? (nowMs - lastActiveMs) / 1000 : 0;
        // Brand new/unsaved file (mtime === 0) or recently edited (< timeout): stay in editor mode.
        // Existing file opened fresh after inactivity (ageSec >= timeout): open in reading mode!
        if (fresh && fileMtimeMs > 0 && ageSec >= timeoutSec) {
          if (!isReading(v.state)) toggleReading(v);
        }
      }
    }
    return id;
  }

  showViewer(id: number, path: string) {
    const el = this.panes.get(id)!.el;
    this.detach(id, false, this.isTerm(id));
    const p: Pane = { el, buf: null, mode: "view", title: path };
    this.panes.set(id, p);
    // Viewers fill a body box, so the tab bar can sit above them.
    const body = document.createElement("div");
    body.className = "pane-body";
    el.append(body);
    const cleanPath = path.startsWith(PREVIEW) ? path.slice(PREVIEW.length) : path;
    p.viewer = viewerFor(path)!.mount(body, {
      url: path.startsWith(BROWSER) ? path.slice(BROWSER.length) : fsUrl(this.wsId, cleanPath),
      onStatus: () => id === this.active && this.emit(),
      openURL: (u) => browsable(u) && void backend.openURL(u),
      getContent: () => this.buffers.get(cleanPath)?.state.doc.toString() ?? null,
    });
    el.addEventListener("focusin", () => this.setActive(id));
    if (!path.startsWith(BROWSER) && !path.startsWith(PREVIEW)) this.touch(path); // an address isn't a recent file
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
      if (path && id > 0 && !isVirtual(path)) panes[id] = path; // the debugger's output isn't a file to open again
      if (p.term && id > 0) terms[id] = p.cmd ?? "";
    }
    const cursors: Record<string, number> = {}, breakpoints: Record<string, Breakpoint[]> = {};
    for (const b of this.buffers.list().filter((b) => !isVirtual(b.path))) {
      cursors[b.path] = b.state.selection.main.head;
      breakpoints[b.path] = breakpointsOf(b.state);
    }
    return { panes, terms, tabs: Object.fromEntries([...this.tabs].map(([id, l]) => [id, l.filter((t) => !isTermTab(t) && !isVirtual(t))])), active: this.active, cursors, breakpoints };
  }

  // Session restore: the pane's tabs before its file opens (which adds to them).
  setTabList(id: number, list: string[]) {
    this.tabs.set(id, [...list]);
    this.renderTabs(id);
  }

  pathOf(id: number) {
    const p = this.panes.get(id);
    const raw = p?.buf?.path ?? p?.title ?? this.currentTab(id);
    if (raw && raw.startsWith(PREVIEW)) return raw.slice(PREVIEW.length);
    return raw;
  }

  // The active editor's file, workspace-relative; null if there is none or it lies outside the folder.
  activePath(): string | null {
    const path = this.current()?.path;
    return path && !path.startsWith("/") ? path : null;
  }

  // Every loaded buffer's breakpoints (files without any are left out): what the debugger is given.
  breakpoints(): Record<string, Breakpoint[]> {
    const out: Record<string, Breakpoint[]> = {};
    for (const b of this.buffers.list()) {
      const list = breakpointsOf(b.state);
      if (list.length) out[b.path] = list;
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

  // <Space>dB: sets or edits a conditional breakpoint or logpoint on the cursor line.
  setBreakpoint(extra?: { condition?: string; logMessage?: string; hitCondition?: string }): Breakpoint | null {
    const v = this.activeView();
    if (!v) return null;
    const bp = setBreakpointOn(v, extra);
    this.emit();
    return bp;
  }

  getBreakpoint(): Breakpoint | null {
    const v = this.activeView();
    return v ? getBreakpointOf(v) : null;
  }

  onRunInTerminal?: (args: { args: string[]; cwd?: string; env?: Record<string, string>; title?: string }) => Promise<{ processId?: number; shellProcessId?: number } | void>;

  runInTerminal(args: { args: string[]; cwd?: string; env?: Record<string, string>; title?: string }) {
    return this.onRunInTerminal ? this.onRunInTerminal(args) : Promise.resolve();
  }

  onDiffSplit?: (path: string) => Promise<void>;

  diffSplit(path: string): Promise<void> {
    return this.onDiffSplit ? this.onDiffSplit(path) : Promise.resolve();
  }

  // Marks the line the debugger stopped on in path (and nowhere else); null clears it everywhere.
  setDebugLine(path: string | null, line = 0) {
    for (const b of this.buffers.list()) {
      const effects = [setDebugLine.of(b.path === path ? line : null)];
      const shown = [...this.panes.values()].filter((p) => p.buf === b);
      for (const p of shown) p.view!.dispatch({ effects });
      if (!shown.length) b.state = b.state.update({ effects }).state;
    }
  }

  // Shows the debugger's output (empty until the program prints) in the active pane.
  async showOutput() {
    await this.buffers.virtual(OUTPUT);
    await this.open(OUTPUT);
  }

  // Adds program output to the debugger's output buffer (debug://output), which is created with the first text.
  async appendOutput(text: string) {
    const b = await this.buffers.virtual(OUTPUT);
    const changes = { from: b.state.doc.length, insert: text };
    const shown = [...this.panes.values()].filter((p) => p.buf === b);
    for (const p of shown) p.view!.dispatch({ changes });
    if (!shown.length) b.state = b.state.update({ changes }).state;
    b.saved = b.state.doc; // never dirty: no file, no swap, no "unsaved" when closing
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
      p.view.dispatch({ effects: settingsEffects(p.buf.path, p.view.state.doc) });
      shown.add(p.buf);
    }
    for (const b of this.buffers.list()) if (!shown.has(b)) b.state = b.state.update({ effects: settingsEffects(b.path, b.state.doc) }).state;
    this.hidden.setFont();
  }

  // Re-reads the active buffer from disk (`:e!`).
  async reload() {
    const b = this.current();
    if (!b || isVirtual(b.path)) return; // no file to read again
    this.show(this.active, await this.buffers.load(b.path));
    void this.loadHead(b.path);
  }

  // Fetches the file's text at HEAD and in the index for the git gutter, without holding up the open. Library files have none.
  private async loadHead(path: string) {
    if (path.startsWith("/") || isVirtual(path)) return;
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
    if (!paths || paths.includes(".editorconfig")) {
      this.editorConfig = this.loadEditorConfig();
      await this.editorConfig;
      this.settingsChanged();
    }
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
    if (p.buf && p.buf !== b) this.steps.forget(id, p.buf); // its view takes the other buffer's history
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
    if (p.term) {
      const title = p.title || "shell";
      return this.onStatus({ pane: this.active, path: `${TERM}${title}`, dirty: false, mode: p.mode, line: 1, col: 1, lines: 1 });
    }
    if (!p.view) {
      return this.onStatus({ pane: this.active, path: p.title ? p.title : null, dirty: false, mode: p.mode, line: 1, col: 1, lines: 1 });
    }
    const st = p.view.state, head = st.selection.main.head, l = st.doc.lineAt(head), unit = st.facet(indentUnit);
    const scopes = scopesAt(st, head).slice(-2).map((s) => ({ at: s.from, text: header(st.doc.lineAt(s.from).text) }));
    this.onStatus({
      pane: this.active,
      path: p.buf?.path ?? null,
      dirty: p.buf ? isDirty(p.buf) : false,
      mode: isReading(st) ? "read" : p.mode,
      line: l.number,
      col: head - l.from + 1,
      lines: st.doc.lines,
      eol: p.buf ? (p.buf.eol === "\r\n" ? "CRLF" : "LF") : undefined,
      indent: unit.includes("\t") ? "Tabs" : `Spaces ${unit.length}`,
      words: (p.buf && isProse(p.buf.path) ? countWords(st.doc) : null) ?? undefined,
      selected: selectionSize(st.doc, st.selection.main.from, st.selection.main.to) || undefined,
      search: this.searchCount(p.view, head),
      recording: (this.recording = recordingRegister()),
      scopes: scopes.length ? scopes : undefined,
    });
    this.scheduleBlame();
  }

  // The "3/12" for Vim's last search; undefined before the first one. :noh clears the highlight but not the query, so
  // the count stays (the overlay is set a moment after the search and no cursor move follows, so it can't be the signal).
  private searchCount(view: EditorView, head: number): string | undefined {
    const vim = getCM(view)?.state.vim as { searchState_?: { getQuery(): RegExp | null } } | undefined;
    const query = vim?.searchState_?.getQuery();
    return (query?.source && searchCount(view.state.doc, query, head)) || undefined;
  }

  // Sends text to the active or panel terminal; returns false if no terminal is running.
  sendToTerm(text: string): boolean {
    const p = this.panes.get(PANEL);
    if (p?.term) {
      p.term.input(text.endsWith("\n") ? text : text + "\n");
      return true;
    }
    for (const pane of this.panes.values()) {
      if (pane.term) {
        pane.term.input(text.endsWith("\n") ? text : text + "\n");
        return true;
      }
    }
    return false;
  }

  // Terminal zoom: d px more for every terminal (shown or hidden), 0 back to the size from settings.json.
  zoomTerms(d: number): number {
    setTermZoom(d ? termZoom() + d : 0);
    for (const p of this.panes.values()) p.term?.setFont();
    this.hidden.setFont();
    return termFontSize();
  }

  // Hidden terminals by name, for the buffer list.
  hiddenTerms() { return this.hidden.titles().map((t) => `term://${t}`); }

  // Moves an existing running terminal from fromId to toId without restarting its shell process.
  moveTerminal(fromId: number, toId: number, title?: string): boolean {
    const to = this.panes.get(toId);
    if (!to) return false;

    const from = this.panes.get(fromId);
    let h: { term: TermHandle; box: HTMLElement; title: string; cmd: string } | null = null;

    if (from?.term && (!title || from.title === title)) {
      const box = from.el.querySelector<HTMLElement>(":scope > .pane-term");
      if (box) {
        box.remove();
        h = { term: from.term, box, title: from.title ?? "shell", cmd: from.cmd ?? "" };
        from.term = undefined;
        from.title = undefined;
        if (fromId > 0) {
          this.dropTermTab(h.title);
          const remaining = this.tabs.get(fromId) ?? [];
          const next = remaining[remaining.length - 1];
          if (next) void this.open(next, fromId);
          else this.replace(fromId);
        } else if (fromId === PANEL) {
          this.panes.delete(PANEL);
          this.tabs.delete(PANEL);
        }
      }
    } else if (title && this.hidden.has(title)) {
      h = this.hidden.take(title) ?? null;
      if (h) {
        this.dropTermTab(h.title);
      }
    }

    if (!h) return false;

    // Remove tab from any previous pane to prevent duplicate tabs
    this.dropTermTab(h.title);

    const toIsTerm = !!to.term;
    this.detach(toId, false, toIsTerm);
    this.showTerm(toId, to.el, h);
    if (this.active === fromId) {
      this.setActive(toId);
    }
    return true;
  }

  // :q! on a terminal: the shell ends instead of hiding.
  killTerm(id: number) {
    const p = this.panes.get(id);
    p?.term?.dispose();
    if (p) p.term = undefined;
  }

  // The folder closes: hidden shells go with it.
  dropHidden() {
    this.hidden.disposeAll();
  }

  private showTerm(id: number, el: HTMLElement, h: { term: TermHandle; box: HTMLElement; title: string; cmd: string }) {
    el.append(h.box);
    const mode = h.box.dataset.mode ?? "terminal";
    this.panes.set(id, { el, term: h.term, buf: null, mode, title: h.title, cmd: h.cmd });
    if (id > 0) this.addTab(id, `${TERM}${h.title}`); // the panel has no tabs
    else this.renderTabs(id);
    el.addEventListener("focusin", () => this.panes.get(id)?.term === h.term && this.setActive(id));
    this.focus(id);
  }

  private hide(p: Pane) {
    const box = p.el.querySelector<HTMLElement>(":scope > .pane-term")!;
    this.hidden.add({ term: p.term!, box, title: p.title!, cmd: p.cmd ?? "" });
  }

  // Shows hidden terminal `title` in pane id, in place of what it showed (a terminal there is hidden in turn).
  private unhide(title: string, id: number): number {
    const p = this.panes.get(id);
    if (p?.term && p.title === title) { this.focus(id); return id; } // its own tab
    if (!this.hidden.has(title)) throw new Error(`No terminal "${title}"`);
    if (!p) throw new Error("No pane to show it in");
    const h = this.hidden.take(title)!;
    this.detach(id, false, !!p.term);
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
    const gone = this.hidden.end(t);
    if (gone) return this.dropTermTab(gone);
    if (onExit) return onExit();
    const id = [...this.panes].find(([, p]) => p.term === t)?.[0];
    if (id === undefined) return;
    // With other tabs in its pane, only its tab closes; alone, the pane does.
    if ((this.tabs.get(id) ?? []).length > 1) void this.tabClose(this.currentTab(id), id);
    else this.onTermExit(id);
  }

  // A hidden shell ended: its tab goes from every pane.
  private dropTermTab(title: string) {
    for (const [id, list] of this.tabs) {
      const i = list.indexOf(`${TERM}${title}`);
      if (i >= 0) { list.splice(i, 1); this.renderTabs(id); }
    }
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
    if (isVirtual(path)) return; // nothing to open again from Recent files after a restart
    try {
      const r = [path, ...this.recent().filter((p) => p !== path)].slice(0, RECENT_MAX);
      localStorage.setItem(this.recentKey, JSON.stringify(r));
    } catch {
      // storage blocked: recent files are a convenience
    }
  }

  private watchMode(id: number) {
    const p = this.panes.get(id)!;
    const cm = getCM(p.view!);
    cm?.on("vim-mode-change", (e: { mode: string }) => {
      p.mode = e.mode;
      if (id === this.active) this.emit();
    });
    // qq and q change no text and no mode, so the status line hears about a macro starting or ending here.
    cm?.on("vim-command-done", () => {
      if (id === this.active && recordingRegister() !== this.recording) this.emit();
    });
  }

  // u or <C-r> in pane id: false lets Vim undo in this pane, as it would anyway.
  private historyIn(id: number, redoing: boolean): boolean {
    const b = this.panes.get(id)?.buf;
    const owner = b ? this.steps.owner(b, redoing) : undefined;
    const o = owner === undefined || owner === id ? undefined : this.panes.get(owner);
    if (!o?.view || o.buf !== b) return false;
    (redoing ? redo : undo)(o.view);
    this.panes.get(id)!.view!.dispatch({ selection: { anchor: o.view.state.selection.main.head } });
    return true;
  }

  private dispatch(id: number, trs: readonly Transaction[], v: EditorView) {
    const depth = undoDepth(v.state);
    v.update(trs);
    const p = this.panes.get(id);
    if (p?.buf && trs.some((t) => t.docChanged && !t.annotation(synced))) this.steps.track(id, p.buf, trs, depth, v.state);
    if (p?.buf) {
      // Other panes on the same buffer get the same changes, outside their undo history (see steps).
      for (const tr of trs) {
        if (!tr.docChanged || tr.annotation(synced)) continue;
        for (const [oid, o] of this.panes)
          if (oid !== id && o.buf === p.buf)
            o.view!.dispatch({ changes: tr.changes, annotations: [synced.of(true), Transaction.addToHistory.of(false)] });
      }
      p.buf.state = v.state; // the docs are equal now; keep the state of the pane that was typed in
      if (trs.some((t) => t.docChanged)) {
        this.lastEdits.set(p.buf.path, Date.now());
        for (const [oid, o] of this.panes) {
          if (oid !== id && o.viewer?.reload && this.pathOf(oid) === p.buf.path) {
            o.viewer.reload();
          }
        }
      }
      if (trs.some((t) => t.effects.some((e) => e.is(setBreakpointLines)))) {
        this.onBreakpointsChanged?.(p.buf.path, this.breakpoints()[p.buf.path] ?? []);
      }
    }
    if (id === this.active) this.emit();
  }
}
