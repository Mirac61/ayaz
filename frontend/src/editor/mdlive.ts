import { EditorSelection, EditorState, StateEffect, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

// Markdown live preview, part 1 (ADR-0003): headings, emphasis, inline code and links read as rendered,
// their markers hidden everywhere except on the lines holding a cursor or selection.

export interface MdDeco {
  hide: [number, number][];
  marks: { from: number; to: number; cls: string }[];
  lines: { at: number; cls: string }[];
  widgets: { from: number; to: number; kind: "bullet" | "check"; checked?: boolean }[]; // replaced by a small widget, outside active lines
}

// Reading view: no line counts as active, not even the cursor's, and the document is read-only.
const setReading = StateEffect.define<boolean>();
const reading = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => tr.effects.reduce((acc, e) => (e.is(setReading) ? e.value : acc), v),
  provide: (f) => [EditorState.readOnly.from(f), EditorView.editorAttributes.from(f, (on): Record<string, string> => (on ? { class: "cm-reading" } : {}))],
});

// null: this state has no live preview (not a Markdown file). Otherwise the new value.
export function toggleReading(v: EditorView): boolean | null {
  const on = v.state.field(reading, false);
  if (on === undefined) return null;
  v.dispatch({ effects: setReading.of(!on) });
  return !on;
}

export const isReading = (state: EditorState) => state.field(reading, false) === true;

// The line spans holding a cursor or selection; they show their raw source. None in the reading view.
const activeRanges = (state: EditorState) =>
  isReading(state) ? [] : state.selection.ranges.map((r) => [state.doc.lineAt(r.from).from, state.doc.lineAt(r.to).to]);

// Pure: what to hide and style in [from, to]. Plain data, so Node tests need no DOM.
export function mdDecorations(state: EditorState, from = 0, to = state.doc.length): MdDeco {
  const doc = state.doc;
  const active = activeRanges(state);
  const out: MdDeco = { hide: [], marks: [], lines: [], widgets: [] };
  // Replacing a line break isn't allowed from a ViewPlugin, and markers on a cursor line stay visible.
  const free = (a: number, b: number) => a < b && !doc.sliceString(a, b).includes("\n") && !active.some(([s, e]) => a <= e && b >= s);
  const hide = (a: number, b: number) => { if (free(a, b)) out.hide.push([a, b]); };
  const hideQuote = (a: number, b: number) => hide(a, doc.sliceString(b, b + 1) === " " ? b + 1 : b);
  // The lines of node n inside [from, to].
  const eachLine = (n: { from: number; to: number }, f: (at: number, first: boolean) => void) => {
    const first = doc.lineAt(n.from).number;
    for (let i = Math.max(first, doc.lineAt(from).number); i <= Math.min(doc.lineAt(n.to).number, doc.lineAt(to).number); i++) f(doc.line(i).from, i === first);
  };
  syntaxTree(state).iterate({
    from, to,
    enter(n) {
      const name = n.name;
      const h = /^ATXHeading(\d)$/.exec(name);
      if (h) out.lines.push({ at: doc.lineAt(n.from).from, cls: `cm-md-h${h[1]}` });
      else if (name === "HeaderMark" && n.node.parent?.name.startsWith("ATX")) {
        const text = doc.sliceString(n.node.parent.from, n.node.parent.to);
        if (n.from === n.node.parent.from) {
          let e = n.to; // "# " → the space goes too
          while (text[e - n.node.parent.from] === " ") e++;
          hide(n.from, e);
        } else {
          let s = n.from; // closing "Title ##"
          while (s > n.node.parent.from && text[s - 1 - n.node.parent.from] === " ") s--;
          hide(s, n.to);
        }
      } else if (name === "EmphasisMark" || name === "StrikethroughMark") hide(n.from, n.to);
      else if (name === "InlineCode") {
        const marks = n.node.getChildren("CodeMark");
        if (marks.length === 2) {
          out.marks.push({ from: marks[0].to, to: marks[1].from, cls: "cm-md-code" });
          hide(marks[0].from, marks[0].to);
          hide(marks[1].from, marks[1].to);
        }
        return false;
      } else if (name === "Link") {
        // [text](url "title"), [text][ref], [text]: hide "[" and everything from "]" on.
        const marks = n.node.getChildren("LinkMark");
        if (marks.length >= 2) {
          out.marks.push({ from: marks[0].to, to: marks[1].from, cls: "cm-md-link" });
          hide(marks[0].from, marks[0].to);
          hide(marks[1].from, n.to);
        }
      } else if (name === "FencedCode" || name === "CodeBlock") {
        // Fence lines stay (dimmed), so line heights don't change; the code itself is highlighted by its own parser.
        const closed = n.node.getChildren("CodeMark").length === 2, last = doc.lineAt(n.to).from;
        eachLine(n, (at, first) => {
          const fence = name === "FencedCode" && (first || closed && at === last);
          out.lines.push({ at, cls: fence ? "cm-md-code-line cm-md-fence" : "cm-md-code-line" });
        });
        for (const q of n.node.getChildren("QuoteMark")) hideQuote(q.from, q.to); // quoted code: the marks sit inside it
        return false;
      } else if (name === "Blockquote") {
        if (n.node.parent?.name !== "Blockquote") eachLine(n, (at) => out.lines.push({ at, cls: "cm-md-quote" })); // nested: once
      } else if (name === "QuoteMark") {
        hideQuote(n.from, n.to);
      } else if (name === "ListMark" && n.node.parent?.parent?.name === "BulletList") {
        // A task item shows its checkbox instead of a bullet.
        if (n.node.nextSibling?.name === "Task") hide(n.from, n.to + 1);
        else if (free(n.from, n.to)) out.widgets.push({ from: n.from, to: n.to, kind: "bullet" });
      } else if (name === "TaskMarker") {
        if (free(n.from, n.to)) out.widgets.push({ from: n.from, to: n.to, kind: "check", checked: doc.sliceString(n.from + 1, n.from + 2) !== " " });
      } else if (name === "Image") return false; // M6
    },
  });
  return out;
}

export interface MdTable {
  from: number; // line start of the first row .. line end of the last
  to: number;
  head: string[];
  align: (string | null)[];
  rows: string[][];
}

// "| a | b\|c |" → ["a", "b|c"]: split on unescaped pipes, like GFM.
function cells(line: string): string[] {
  const t = line.trim().replace(/^\|/, ""), out: string[] = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "\\" && t[i + 1] === "|") { cur += "|"; i++; }
    else if (t[i] === "|") { out.push(cur.trim()); cur = ""; }
    else cur += t[i];
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Pure: the top-level GFM tables of the document, as plain data. Tables inside quotes and lists stay raw in v1.
// shortcut: walks the whole tree on each update; fine for a few hundred tables, limit to the viewport if big.md hurts (K5).
export function mdTables(state: EditorState): MdTable[] {
  const doc = state.doc, out: MdTable[] = [];
  syntaxTree(state).iterate({
    enter(n) {
      if (n.name !== "Table") return n.name === "Document";
      const first = doc.lineAt(n.from), last = doc.lineAt(n.to);
      if (last.number - first.number < 1) return false;
      const head = cells(first.text), width = head.length;
      const row = (i: number) => Array.from({ length: width }, (_, c) => cells(doc.line(i).text)[c] ?? "");
      const align = row(first.number + 1).map((d) => (/^:-+:$/.test(d) ? "center" : /^-+:$/.test(d) ? "right" : /^:-+$/.test(d) ? "left" : null));
      const rows: string[][] = [];
      for (let i = first.number + 2; i <= last.number; i++) rows.push(row(i));
      out.push({ from: first.from, to: last.to, head, align, rows });
      return false;
    },
  });
  return out;
}

// The link target under pos: a Markdown link's URL, an autolink, or a bare http(s) URL in any file.
export function linkAt(state: EditorState, pos: number): string | null {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === "URL") return state.doc.sliceString(n.from, n.to);
    if (n.name === "Link" || n.name === "Autolink" || n.name === "Image") {
      const u = n.getChild("URL");
      return u ? state.doc.sliceString(u.from, u.to) : null;
    }
  }
  const line = state.doc.lineAt(pos);
  for (const m of line.text.matchAll(/https?:\/\/[^\s<>()[\]"'`]+/g)) {
    const s = line.from + m.index!;
    if (pos >= s && pos < s + m[0].length) return m[0].replace(/[.,;:!?]+$/, "");
  }
  return null;
}

const isURL = (t: string) => /^[a-z][a-z0-9+.-]*:/i.test(t);

// A relative link target → workspace path next to `file`. null for URLs, absolute paths and paths above the root.
export function resolveLink(file: string, target: string): string | null {
  let t = target.replace(/[#?].*$/, "");
  if (!t || isURL(t) || t.startsWith("/")) return null;
  try { t = decodeURIComponent(t); } catch { /* keep it as written */ }
  const parts = file.split("/").slice(0, -1);
  for (const p of t.split("/")) {
    if (p === "..") { if (!parts.length) return null; parts.pop(); }
    else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
}

// gx opens only real URLs in the browser; a relative file is gf's job.
export const browsable = (t: string) => isURL(t) && !/^(javascript|file|data):/i.test(t);

const hidden = Decoration.replace({});

class Bullet extends WidgetType {
  eq() { return true; }
  toDOM() { const e = document.createElement("span"); e.textContent = "•"; return e; }
}
const bullet = Decoration.replace({ widget: new Bullet() });

// Clicking flips the x in the document, a normal transaction so undo works. A reading view only looks.
class Check extends WidgetType {
  constructor(readonly on: boolean) { super(); }
  eq(o: Check) { return o.on === this.on; }
  toDOM(view: EditorView) {
    const i = document.createElement("input");
    i.type = "checkbox";
    i.checked = this.on;
    i.className = "cm-md-check";
    i.addEventListener("click", (e) => e.preventDefault()); // the redraw shows the new state
    i.addEventListener("mousedown", (e) => {
      e.preventDefault(); // no cursor move, no focus change
      const at = view.posAtDOM(i);
      if (view.state.readOnly || !/^\[[ xX]\]$/.test(view.state.doc.sliceString(at, at + 3))) return;
      view.dispatch({ changes: { from: at + 1, to: at + 2, insert: view.state.doc.sliceString(at + 1, at + 2) === " " ? "x" : " " } });
    });
    return i;
  }
}
const LINE_H = 20; // 13 px font × 1.5, see the theme

class TableWidget extends WidgetType {
  constructor(readonly t: MdTable) { super(); }
  eq(o: TableWidget) { return JSON.stringify(o.t) === JSON.stringify(this.t); }
  // One source line per row plus the delimiter row, so the scrollbar barely jumps once it is measured.
  get estimatedHeight() { return (this.t.rows.length + 2) * LINE_H; }
  ignoreEvent() { return false; } // a click reaches the editor, puts the cursor in and shows the source
  toDOM() {
    const wrap = document.createElement("div"), table = wrap.appendChild(document.createElement("table"));
    wrap.className = "cm-md-table";
    const add = (parent: HTMLElement, tag: "th" | "td", row: string[]) => {
      const tr = parent.appendChild(document.createElement("tr"));
      row.forEach((text, i) => {
        const c = tr.appendChild(document.createElement(tag));
        c.textContent = text; // never innerHTML: no raw HTML from files (Q8)
        if (this.t.align[i]) c.style.textAlign = this.t.align[i]!;
      });
    };
    add(table.createTHead(), "th", this.t.head);
    const body = table.createTBody();
    for (const r of this.t.rows) add(body, "td", r);
    return wrap;
  }
}

// Block widgets can't come from a ViewPlugin (ADR-0003), so tables live in a StateField.
const tables = StateField.define<DecorationSet>({
  create: (state) => tableDecos(state),
  update: (deco, tr) =>
    tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState) || isReading(tr.state) !== isReading(tr.startState)
      ? tableDecos(tr.state) : deco,
  provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((v) => v.state.field(f))],
});

// Vertical motion hops over a block widget, so j/k from the line next to a table would never reach it.
// A one-line step across a table lands on it instead; the table then shows its source.
const enterTables = EditorState.transactionFilter.of((tr) => {
  const sel = tr.selection;
  if (!sel || tr.docChanged || isReading(tr.startState)) return tr;
  const doc = tr.startState.doc, line = (pos: number) => doc.lineAt(pos).number;
  const was = line(tr.startState.selection.main.head), now = sel.main;
  let to: number | null = null;
  tr.startState.field(tables).between(0, doc.length, (from, end) => {
    if (was === line(from) - 1 && line(now.head) === line(end) + 1) to = from;
    else if (was === line(end) + 1 && line(now.head) === line(from) - 1) to = end;
  });
  return to === null ? tr : [tr, { selection: now.empty ? EditorSelection.cursor(to) : EditorSelection.range(now.anchor, to) }];
});

// A table holding a cursor or selection shows its raw source.
function tableDecos(state: EditorState): DecorationSet {
  const active = activeRanges(state);
  return Decoration.set(mdTables(state).filter((t) => !active.some(([s, e]) => t.from <= e && t.to >= s))
    .map((t) => Decoration.replace({ widget: new TableWidget(t), block: true }).range(t.from, t.to)));
}

const check = (on: boolean) => Decoration.replace({ widget: new Check(on) });

class Live {
  deco: DecorationSet;
  hidden: DecorationSet;
  constructor(v: EditorView) { [this.deco, this.hidden] = build(v); }
  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged || u.selectionSet || isReading(u.state) !== isReading(u.startState) || syntaxTree(u.state) !== syntaxTree(u.startState))
      [this.deco, this.hidden] = build(u.view);
  }
}

function build(v: EditorView): [DecorationSet, DecorationSet] {
  const all: Range<Decoration>[] = [], hides: Range<Decoration>[] = [];
  for (const { from, to } of v.visibleRanges) {
    const d = mdDecorations(v.state, from, to);
    for (const l of d.lines) all.push(Decoration.line({ class: l.cls }).range(l.at));
    for (const m of d.marks) if (m.from < m.to) all.push(Decoration.mark({ class: m.cls }).range(m.from, m.to));
    for (const [a, b] of d.hide) hides.push(hidden.range(a, b));
    for (const w of d.widgets) hides.push((w.kind === "bullet" ? bullet : check(!!w.checked)).range(w.from, w.to)); // atomic like hidden marks
  }
  const h = Decoration.set(hides, true);
  return [Decoration.set([...all, ...hides], true), h];
}

const live = ViewPlugin.fromClass(Live, { decorations: (p) => p.deco });

const theme = EditorView.baseTheme({
  ".cm-md-h1": { fontSize: "1.6em" },
  ".cm-md-h2": { fontSize: "1.4em" },
  ".cm-md-h3": { fontSize: "1.2em" },
  ".cm-md-h4, .cm-md-h5, .cm-md-h6": { fontSize: "1.05em" },
  ".cm-md-code": { backgroundColor: "#2a2a37", borderRadius: "3px", padding: "0 2px" },
  ".cm-md-link": { color: "#7e9cd8", textDecoration: "underline" },
  ".cm-md-code-line": { backgroundColor: "#1f1f28" },
  ".cm-md-quote": { borderLeft: "3px solid #54546d", paddingLeft: "8px", color: "#c8c093" },
  ".cm-md-table": { overflowX: "auto", padding: "4px 0" },
  ".cm-md-table table": { borderCollapse: "collapse" },
  ".cm-md-table th, .cm-md-table td": { border: "1px solid #54546d", padding: "2px 10px" },
  ".cm-md-table th": { backgroundColor: "#2a2a37", fontWeight: "bold" },
  ".cm-md-check": { margin: "0 4px 0 0", verticalAlign: "middle", accentColor: "#7e9cd8" },
  ".cm-md-fence": { color: "#727169" },
  "&.cm-reading .cm-activeLine": { backgroundColor: "transparent" },
});

// Hidden markers are atomic, so the mouse and CM's own motions step over them.
export const mdlive = [reading, tables, enterTables, live, theme, EditorView.atomicRanges.of((v) => v.plugin(live)?.hidden ?? Decoration.none)];
