import { afterEach, expect, test } from "vitest";
import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import { editorExtensions } from "./editor";
import { moveHunk, previewHunk, resetHunk, setHead } from "./gitgutter";

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
