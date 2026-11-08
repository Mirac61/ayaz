import { EditorState, StateEffect, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

// Markdown live preview, part 1 (ADR-0003): headings, emphasis, inline code and links read as rendered,
// their markers hidden everywhere except on the lines holding a cursor or selection.

export interface MdDeco {
  hide: [number, number][];
  marks: { from: number; to: number; cls: string }[];
  lines: { at: number; cls: string }[];
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

// Pure: what to hide and style in [from, to]. Plain data, so Node tests need no DOM.
export function mdDecorations(state: EditorState, from = 0, to = state.doc.length): MdDeco {
  const doc = state.doc;
  const active = isReading(state) ? [] : state.selection.ranges.map((r) => [doc.lineAt(r.from).from, doc.lineAt(r.to).to]);
  const out: MdDeco = { hide: [], marks: [], lines: [] };
  // Replacing a line break isn't allowed from a ViewPlugin, and markers on a cursor line stay visible.
  const hide = (a: number, b: number) => {
    if (a < b && !doc.sliceString(a, b).includes("\n") && !active.some(([s, e]) => a <= e && b >= s)) out.hide.push([a, b]);
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
        const first = doc.lineAt(n.from).number, last = doc.lineAt(n.to).number;
        for (let i = Math.max(first, doc.lineAt(from).number); i <= Math.min(last, doc.lineAt(to).number); i++) {
          const fence = name === "FencedCode" && (i === first || i === last && n.node.getChildren("CodeMark").length === 2);
          out.lines.push({ at: doc.line(i).from, cls: fence ? "cm-md-code-line cm-md-fence" : "cm-md-code-line" });
        }
        return false;
      } else if (name === "Image") return false; // M6
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
  ".cm-md-fence": { color: "#727169" },
  "&.cm-reading .cm-activeLine": { backgroundColor: "transparent" },
});

// Hidden markers are atomic, so the mouse and CM's own motions step over them.
export const mdlive = [reading, live, theme, EditorView.atomicRanges.of((v) => v.plugin(live)?.hidden ?? Decoration.none)];
