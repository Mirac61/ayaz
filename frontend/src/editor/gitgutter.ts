// Git changes in the gutter, like gitsigns: the buffer against its text at HEAD. Only the chunk diff comes from
// @codemirror/merge; the gutter, hunk jumps, preview and reset are ours.
import { Chunk, getOriginalDoc, unifiedMergeView } from "@codemirror/merge";
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
  constructor(readonly sign: Sign, readonly staged: boolean) {
    super();
    this.elementClass = `cm-git-${sign}` + (staged ? " cm-git-staged" : "");
  }
  eq(o: Mark) { return o.sign === this.sign && o.staged === this.staged; }
}
const mark = (staged: boolean) => ({
  add: new Mark("add", staged), mod: new Mark("mod", staged), del: new Mark("del", staged), deltop: new Mark("deltop", staged),
});
const MARKS = mark(false), STAGED = mark(true);

// head: the file at HEAD; index: what is staged; chunks: buffer against HEAD (all the changes), unstaged: buffer against
// the index (what <Space>hs can stage). Without anything staged (index equals head) the two are the same.
interface Git { head: Text; index: Text; chunks: readonly Chunk[]; unstaged: readonly Chunk[]; marks: RangeSet<Mark> }

const git = (head: Text, index: Text, chunks: readonly Chunk[], unstaged: readonly Chunk[], doc: Text): Git => {
  // A line of a change against HEAD that the buffer doesn't change against the index is staged: drawn dimmer.
  const open = head.eq(index) ? null : new Set(signs(unstaged, doc).map((x) => x.line));
  // Two chunks can mark one line (a deletion right below a change); the first wins.
  const seen = new Set<number>();
  const marks = RangeSet.of(signs(chunks, doc).filter((x) => !seen.has(x.line) && seen.add(x.line))
    .map((x) => (open && !open.has(x.line) ? STAGED : MARKS)[x.sign].range(doc.line(x.line).from)));
  return { head, index, chunks, unstaged, marks };
};

// Builds the state for a HEAD (and index) text against the buffer.
const fresh = (head: Text, index: Text, doc: Text) => {
  const chunks = Chunk.build(head, doc);
  return git(head, index, chunks, index.eq(head) ? chunks : Chunk.build(index, doc), doc);
};

// null: no HEAD text (new file, no repository): no signs.
export const setHead = StateEffect.define<Text | null>();
// What is staged; until it is known the index counts as HEAD.
export const setIndex = StateEffect.define<Text | null>();

const gitField = StateField.define<Git | null>({
  create: () => null,
  update(g, tr) {
    for (const e of tr.effects) {
      if (e.is(setHead)) g = e.value && fresh(e.value, g?.index ?? e.value, tr.state.doc);
      else if (e.is(setIndex) && g) g = fresh(g.head, e.value ?? g.head, tr.state.doc);
    }
    if (g && tr.docChanged) {
      const chunks = Chunk.updateB(g.chunks, g.head, tr.state.doc, tr.changes);
      const unstaged = g.index.eq(g.head) ? chunks : Chunk.updateB(g.unstaged, g.index, tr.state.doc, tr.changes);
      g = git(g.head, g.index, chunks, unstaged, tr.state.doc);
    }
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

// <Space>fh: the same view against an older version of the file (local history).
export function diffWith(view: EditorView, original: Text) {
  view.dispatch({ effects: diffing.reconfigure(diffView(original)) });
}

// With a new HEAD, an open diff against HEAD compares against it (or closes when the file left HEAD).
// A diff against a history version stays.
export function headEffects(s: EditorState, head: Text | null, index: Text | null = null): StateEffect<unknown>[] {
  const effects = [setHead.of(head), setIndex.of(index)];
  if (!isDiffing(s) || getOriginalDoc(s) !== s.field(gitField, false)?.head) return effects;
  return [...effects, diffing.reconfigure(head ? diffView(head) : [])];
}

export const gitGutter = [
  gitField,
  previewField,
  diffing.of([]),
  gutter({ class: "cm-git", markers: (v) => v.state.field(gitField, false)?.marks ?? RangeSet.empty }),
];

const chunksOf = (s: EditorState) => s.field(gitField, false)?.chunks ?? [];

// The chunk on a line of the B side; a deletion counts on the line it marks and the one below.
function chunkOnLine(chunks: readonly Chunk[], doc: Text, line: number): Chunk | null {
  return chunks.find((c) => {
    const from = doc.lineAt(Math.min(c.fromB, doc.length)).number;
    if (c.fromB === c.toB) return line === from || line === from - 1;
    return line >= from && line <= doc.lineAt(Math.min(c.endB, doc.length)).number;
  }) ?? null;
}

const chunkAt = (s: EditorState) => chunkOnLine(chunksOf(s), s.doc, s.doc.lineAt(s.selection.main.head).number);

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

// "-a,b" or "+c,d" of a hunk header: a count of 1 is left out, 0 stays.
const span = (start: number, n: number) => (n === 1 ? `${start}` : `${start},${n}`);

// One chunk as a hunk without context ("@@ -a,b +c,d @@" and its lines) that turns text a into text b there.
// An insertion's start is the line before it, as git writes it for -U0.
export function hunkText(a: Text, b: Text, c: Chunk): string {
  const side = (doc: Text, from: number, to: number, mark: string) => {
    const text = doc.sliceString(Math.min(from, doc.length), Math.min(to, doc.length));
    const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
    const start = from === to ? doc.lineAt(Math.min(from, doc.length)).number - 1 : doc.lineAt(from).number;
    const noEol = "\\ No newline at end of file\n"; // the last line of a file without a final newline
    const body = lines.map((l, i) => `${mark}${l}\n` + (i === lines.length - 1 && !text.endsWith("\n") ? noEol : ""));
    return { start, n: lines.length, body: body.join("") };
  };
  const old = side(a, c.fromA, c.toA, "-"), now = side(b, c.fromB, c.toB, "+");
  return `@@ -${span(old.start, old.n)} +${span(now.start, now.n)} @@\n${old.body}${now.body}`;
}

// Where the buffer's position pos is in the index text, or null if the buffer changed it (an unstaged line).
function toIndex(g: Git, pos: number): number | null {
  let shift = 0;
  for (const c of g.unstaged) {
    if (pos >= c.toB) shift += (c.toA - c.fromA) - (c.toB - c.fromB);
    else if (pos >= c.fromB) return null;
  }
  return pos + shift;
}

// The hunk under the cursor for the index: staging (the buffer's change against the index, to be applied) or, with
// unstage, a change that is staged (HEAD against the index, to be applied in reverse). null: no such hunk here.
export function hunkPatch(view: EditorView, unstage: boolean): string | null {
  const s = view.state, g = s.field(gitField, false);
  if (!g) return null;
  const line = s.doc.lineAt(s.selection.main.head).number;
  if (!unstage) {
    const c = chunkOnLine(g.unstaged, s.doc, line);
    return c ? hunkText(g.index, s.doc, c) : null;
  }
  const at = toIndex(g, s.doc.lineAt(s.selection.main.head).from);
  if (at === null || g.head.eq(g.index)) return null;
  const c = chunkOnLine(Chunk.build(g.head, g.index), g.index, g.index.lineAt(Math.min(at, g.index.length)).number);
  return c ? hunkText(g.head, g.index, c) : null;
}
