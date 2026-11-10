// Git changes in the gutter, like gitsigns: the buffer against its text at HEAD. Only the chunk diff comes from
// @codemirror/merge; the gutter, hunk jumps, preview and reset are ours.
import { Chunk, unifiedMergeView } from "@codemirror/merge";
import { Compartment, RangeSet, StateEffect, StateField, Text, type EditorState } from "@codemirror/state";
import { EditorView, GutterMarker, gutter, showTooltip, type Tooltip } from "@codemirror/view";

export type Sign = "add" | "mod" | "del" | "deltop";

// Chunks (A = HEAD, B = buffer) → one sign per line. A deletion marks the line above it, at the top line 1.
export function signs(chunks: readonly Chunk[], doc: Text): { line: number; sign: Sign }[] {
  const out: { line: number; sign: Sign }[] = [];
  for (const c of chunks) {
    const from = Math.min(c.fromB, doc.length);
    if (c.fromB === c.toB) {
      out.push(from === 0 ? { line: 1, sign: "deltop" } : { line: doc.lineAt(from - 1).number, sign: "del" });
      continue;
    }
    const sign = c.fromA === c.toA ? "add" : "mod";
    const last = doc.lineAt(Math.min(c.endB, doc.length)).number;
    for (let l = doc.lineAt(from).number; l <= last; l++) out.push({ line: l, sign });
  }
  return out;
}

class Mark extends GutterMarker {
  constructor(readonly sign: Sign) { super(); this.elementClass = `cm-git-${sign}`; }
  eq(o: Mark) { return o.sign === this.sign; }
}
const MARKS = { add: new Mark("add"), mod: new Mark("mod"), del: new Mark("del"), deltop: new Mark("deltop") };

interface Git { head: Text; chunks: readonly Chunk[]; marks: RangeSet<Mark> }

const git = (head: Text, chunks: readonly Chunk[], doc: Text): Git => {
  // Two chunks can mark one line (a deletion right below a change); the first wins.
  const seen = new Set<number>();
  const marks = RangeSet.of(signs(chunks, doc).filter((x) => !seen.has(x.line) && seen.add(x.line))
    .map((x) => MARKS[x.sign].range(doc.line(x.line).from)));
  return { head, chunks, marks };
};

// null: no HEAD text (new file, no repository): no signs.
export const setHead = StateEffect.define<Text | null>();

const gitField = StateField.define<Git | null>({
  create: () => null,
  update(g, tr) {
    for (const e of tr.effects) if (e.is(setHead)) g = e.value && git(e.value, Chunk.build(e.value, tr.state.doc), tr.state.doc);
    if (g && tr.docChanged) g = git(g.head, Chunk.updateB(g.chunks, g.head, tr.state.doc, tr.changes), tr.state.doc);
    return g;
  },
});

const previewField = StateField.define<Tooltip | null>({
  create: () => null,
  update(t, tr) {
    for (const e of tr.effects) if (e.is(showPreview)) return e.value;
    return tr.docChanged || tr.selection ? null : t;
  },
  provide: (f) => showTooltip.from(f),
});
const showPreview = StateEffect.define<Tooltip | null>();

// <Space>gd: the HEAD text inline, removed lines above the changed ones (merge's unified view), like a diff.
const diffing = new Compartment();
const diffView = (head: Text) => unifiedMergeView({ original: head, gutter: false, mergeControls: false });
export function isDiffing(s: EditorState) {
  const ext = diffing.get(s);
  return Array.isArray(ext) && ext.length > 0;
}

// Turns the diff on or off. false: no HEAD text to compare with.
export function toggleDiff(view: EditorView): boolean {
  const head = view.state.field(gitField, false)?.head;
  if (!isDiffing(view.state) && !head) return false;
  view.dispatch({ effects: diffing.reconfigure(isDiffing(view.state) || !head ? [] : diffView(head)) });
  return true;
}

// With a new HEAD, an open diff compares against it (or closes when the file left HEAD).
export function headEffects(s: EditorState, head: Text | null): StateEffect<unknown>[] {
  if (!isDiffing(s)) return [setHead.of(head)];
  return [setHead.of(head), diffing.reconfigure(head ? diffView(head) : [])];
}

export const gitGutter = [
  gitField,
  previewField,
  diffing.of([]),
  gutter({ class: "cm-git", markers: (v) => v.state.field(gitField, false)?.marks ?? RangeSet.empty }),
];

const chunksOf = (s: EditorState) => s.field(gitField, false)?.chunks ?? [];

// The chunk on the cursor's line; a deletion counts on the line it marks and the one below.
function chunkAt(s: EditorState): Chunk | null {
  const line = s.doc.lineAt(s.selection.main.head).number;
  return chunksOf(s).find((c) => {
    const from = s.doc.lineAt(Math.min(c.fromB, s.doc.length)).number;
    if (c.fromB === c.toB) return line === from || line === from - 1;
    return line >= from && line <= s.doc.lineAt(Math.min(c.endB, s.doc.length)).number;
  }) ?? null;
}

// ]c / [c: the next or previous hunk's first line, wrapping around like gitsigns. false: no hunks.
export function moveHunk(view: EditorView, d: 1 | -1): boolean {
  const s = view.state, cur = s.doc.lineAt(s.selection.main.head).number;
  const starts = [...new Set(chunksOf(s).map((c) => s.doc.lineAt(Math.min(c.fromB, s.doc.length)).number))];
  if (!starts.length) return false;
  const next = d > 0 ? starts.find((l) => l > cur) ?? starts[0] : [...starts].reverse().find((l) => l < cur) ?? starts[starts.length - 1];
  const pos = s.doc.line(next).from;
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
  return true;
}

// The HEAD text of the hunk under the cursor as a tooltip, removed lines over added ones. false: no hunk here.
export function previewHunk(view: EditorView): boolean {
  const s = view.state, c = chunkAt(s), g = s.field(gitField, false);
  if (!c || !g) return false;
  const lines = (t: Text, from: number, to: number, mark: string) =>
    from === to ? [] : t.sliceString(from, Math.min(to, t.length)).replace(/\n$/, "").split("\n").map((l) => mark + l);
  const pre = document.createElement("pre");
  pre.className = "cm-git-preview";
  for (const [l, cls] of [...lines(g.head, c.fromA, c.toA, "-").map((l) => [l, "del"]), ...lines(s.doc, c.fromB, c.toB, "+").map((l) => [l, "add"])])
    pre.append(Object.assign(document.createElement("div"), { className: cls, textContent: l }));
  const pos = Math.min(c.fromB, s.doc.length);
  view.dispatch({ effects: showPreview.of({ pos, above: false, create: () => ({ dom: pre }) }) });
  return true;
}

// Puts the hunk under the cursor back to HEAD, as a normal edit (undo works). false: no hunk here.
export function resetHunk(view: EditorView): boolean {
  const s = view.state, c = chunkAt(s), g = s.field(gitField, false);
  if (!c || !g) return false;
  const insert = g.head.sliceString(c.fromA, Math.min(c.toA, g.head.length));
  const from = Math.min(c.fromB, s.doc.length);
  view.dispatch({ changes: { from, to: Math.min(c.toB, s.doc.length), insert }, userEvent: "git.reset" });
  return true;
}
