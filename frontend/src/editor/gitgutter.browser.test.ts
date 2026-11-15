import { afterEach, expect, test } from "vitest";
import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import { editorExtensions } from "./editor";
import { inlineBlame, showBlame } from "./blame";
import { diffWith, headEffects, hunkPatch, isDiffing, moveHunk, previewHunk, resetHunk, setHead, toggleDiff } from "./gitgutter";

let view: EditorView | null = null;
afterEach(() => { view?.destroy(); view = null; });

const HEAD = "one\ntwo\nthree\nfour\n";
function mk() {
  const el = document.createElement("div");
  document.body.append(el);
  view = new EditorView({ parent: el, state: EditorState.create({ doc: HEAD, extensions: editorExtensions() }) });
  view.dispatch({ effects: setHead.of(Text.of(HEAD.split("\n"))) });
  return view;
}
const signs = (v: EditorView, cls: string) => v.dom.querySelectorAll(`.cm-git .${cls}`).length;

test("the gutter follows typing", () => {
  const v = mk();
  expect(signs(v, "cm-git-mod") + signs(v, "cm-git-add")).toBe(0);
  v.dispatch({ changes: { from: v.state.doc.line(2).from, insert: "X" } });
  expect(signs(v, "cm-git-mod")).toBe(1);
  v.dispatch({ changes: { from: v.state.doc.line(4).to, insert: "\nfive" } });
  expect(signs(v, "cm-git-add")).toBe(1);
});

test("]c jumps between hunks, reset puts one back and undo brings it again", () => {
  const v = mk();
  v.dispatch({ changes: [{ from: v.state.doc.line(1).from, insert: "X" }, { from: v.state.doc.line(3).from, insert: "Y" }] });
  expect(moveHunk(v, 1)).toBe(true);
  expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(3);
  expect(moveHunk(v, 1)).toBe(true); // wraps around
  expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(1);
  expect(previewHunk(v)).toBe(true);
  expect(v.dom.querySelector(".cm-git-preview")?.textContent).toBe("-one+Xone");
  expect(resetHunk(v)).toBe(true);
  expect(v.state.doc.line(1).text).toBe("one");
  expect(signs(v, "cm-git-mod")).toBe(1);
  undo(v);
  expect(v.state.doc.line(1).text).toBe("Xone");
});

test("no HEAD, no hunks", () => {
  const v = mk();
  v.dispatch({ effects: setHead.of(null), changes: { from: 0, insert: "X" } });
  expect(signs(v, "cm-git-mod")).toBe(0);
  expect(moveHunk(v, 1)).toBe(false);
  expect(resetHunk(v)).toBe(false);
});

test("<Space>gd shows HEAD's lines inline, follows a new HEAD, and turns off again", () => {
  const v = mk();
  v.dispatch({ changes: { from: v.state.doc.line(2).from, to: v.state.doc.line(2).to, insert: "TWO" } });
  expect(toggleDiff(v)).toBe(true);
  expect(isDiffing(v.state)).toBe(true);
  expect(v.dom.querySelector(".cm-deletedChunk")?.textContent).toContain("two");
  v.dispatch({ effects: headEffects(v.state, Text.of(["one", "TWO", "three", "four", ""])) }); // a commit
  expect(v.dom.querySelector(".cm-deletedChunk")).toBeNull();
  expect(toggleDiff(v)).toBe(true);
  expect(isDiffing(v.state)).toBe(false);
  v.dispatch({ effects: setHead.of(null) });
  expect(toggleDiff(v)).toBe(false); // nothing to compare with
});

test("<Space>fh: a diff against an older version stays when HEAD moves, <Space>gd closes it", () => {
  const v = mk();
  diffWith(v, Text.of(["one", "old two", "three", "four", ""]));
  expect(v.dom.querySelector(".cm-deletedChunk")?.textContent).toContain("old two");
  v.dispatch({ effects: headEffects(v.state, Text.of(["new head", ""])) }); // a commit
  expect(v.dom.querySelector(".cm-deletedChunk")?.textContent).toContain("old two");
  expect(toggleDiff(v)).toBe(true);
  expect(isDiffing(v.state)).toBe(false);
});

test("the blame text sits at the end of the cursor line and goes when the cursor moves", async () => {
  const el = document.createElement("div");
  document.body.append(el);
  const v = new EditorView({ parent: el, state: EditorState.create({ doc: "one\ntwo\nthree", extensions: [inlineBlame] }) });
  v.dispatch({ selection: { anchor: 5 } }); // in "two"
  showBlame(v, "Ada, 3 days ago • a1b2c3d4 fix");
  const line = () => [...el.querySelectorAll(".cm-line")].find((l) => l.querySelector(".cm-blame"))?.textContent;
  expect(line()).toContain("two");
  expect(el.querySelector(".cm-blame")?.textContent).toBe("Ada, 3 days ago • a1b2c3d4 fix");
  v.dispatch({ selection: { anchor: 0 } });
  expect(el.querySelector(".cm-blame")).toBeNull();
  showBlame(v, "again");
  v.dispatch({ changes: { from: 0, insert: "x" } });
  expect(el.querySelector(".cm-blame")).toBeNull();
  v.destroy();
  el.remove();
});

// M61: what is staged is drawn dimmer, <Space>hs patches the index with the unstaged hunk, <Space>hu with a staged one.
test("staged changes are dimmed, and the hunk to stage or unstage is the one on the cursor line", async () => {
  const el = document.createElement("div");
  document.body.append(el);
  const head = Text.of("a\nb\nc\nd\n".split("\n")), index = Text.of("a\nB\nc\nd\n".split("\n"));
  // b → B is staged; d → D is only in the buffer.
  const v = new EditorView({ parent: el, state: EditorState.create({ doc: "a\nB\nc\nD\n", extensions: [editorExtensions()] }) });
  v.dispatch({ effects: headEffects(v.state, head, index) });
  const marks = () => [...el.querySelectorAll(".cm-git .cm-gutterElement")]
    .map((m) => m.className.replace("cm-gutterElement ", "").trim())
    .filter((m) => m.includes("cm-git-"))
    .sort();
  await expect.poll(marks).toEqual(["cm-git-mod", "cm-git-mod cm-git-staged"]);

  v.dispatch({ selection: { anchor: v.state.doc.line(2).from } });
  expect(hunkPatch(v, false)).toBeNull(); // line 2 matches the index: nothing to stage
  expect(hunkPatch(v, true)).toBe("@@ -2 +2 @@\n-b\n+B\n"); // reverse-applied by git: the index's B goes back to b
  v.dispatch({ selection: { anchor: v.state.doc.line(4).from } });
  expect(hunkPatch(v, false)).toBe("@@ -4 +4 @@\n-d\n+D\n");
  expect(hunkPatch(v, true)).toBeNull(); // line 4 isn't staged
  v.dispatch({ selection: { anchor: v.state.doc.line(3).from } });
  expect(hunkPatch(v, false)).toBeNull();
  expect(hunkPatch(v, true)).toBeNull();

  // A line added above shifts the buffer against the index: the staged hunk is still found.
  v.dispatch({ changes: { from: 0, insert: "new\n" } });
  v.dispatch({ selection: { anchor: v.state.doc.line(3).from } }); // on "B"
  expect(hunkPatch(v, true)).toBe("@@ -2 +2 @@\n-b\n+B\n");
  v.destroy();
  el.remove();
});
