import { afterEach, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorExtensions } from "./editor";
import { moveConflict, resolveConflict } from "./conflicts";

let view: EditorView | null = null;
afterEach(() => {
  const box = view?.dom.parentElement;
  view?.destroy();
  box?.remove();
  view = null;
});

const SRC = [
  "top", "<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> feature", "mid", "<<<<<<< HEAD", "x", "=======", "y", ">>>>>>> f", "end",
].join("\n");

function mount(doc = SRC) {
  const el = document.createElement("div");
  document.body.append(el);
  view = new EditorView({ parent: el, state: EditorState.create({ doc, extensions: [editorExtensions()] }) });
  return el;
}
const cursorAt = (v: EditorView, line: number) => v.dispatch({ selection: { anchor: v.state.doc.line(line).from } });

test("the blocks are coloured: ours, theirs and their marker lines", () => {
  const el = mount();
  const text = (cls: string) => [...el.querySelectorAll(cls)].map((l) => l.textContent);
  expect(text(".cm-conflict-ours")).toEqual(["ours", "x"]);
  expect(text(".cm-conflict-theirs")).toEqual(["theirs", "y"]);
  expect(text(".cm-conflict-marker").length).toBe(6);
});

test("colours follow edits: typing a marker makes a conflict, taking a side removes it", () => {
  const el = mount("a\nb\n");
  expect(el.querySelector(".cm-conflict-marker")).toBeNull();
  view!.dispatch({ changes: { from: 0, insert: "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> t\n" } });
  expect(el.querySelectorAll(".cm-conflict-marker").length).toBe(3);
  cursorAt(view!, 2);
  expect(resolveConflict(view!, "theirs")).toBe(true);
  expect(view!.state.doc.toString()).toBe("theirs\na\nb\n");
  expect(el.querySelector(".cm-conflict-marker")).toBeNull();
});

test("ours, theirs and both replace the block under the cursor, and only that one", () => {
  mount();
  cursorAt(view!, 3); // in "ours" of the first block
  resolveConflict(view!, "ours");
  const second = ["<<<<<<< HEAD", "x", "=======", "y", ">>>>>>> f"];
  expect(view!.state.doc.toString()).toBe(["top", "ours", "mid", ...second, "end"].join("\n"));
  expect(view!.state.doc.lineAt(view!.state.selection.main.head).text).toBe("ours"); // the cursor stays at the result
  cursorAt(view!, 5); // on "x"
  resolveConflict(view!, "both");
  expect(view!.state.doc.toString()).toBe(["top", "ours", "mid", "x", "y", "end"].join("\n"));
  expect(resolveConflict(view!, "ours")).toBe(false); // none left under the cursor
});

test("]x and [x jump between conflicts and wrap around; none gives false", () => {
  mount();
  const line = () => view!.state.doc.lineAt(view!.state.selection.main.head).number;
  moveConflict(view!, 1);
  expect(line()).toBe(2);
  moveConflict(view!, 1);
  expect(line()).toBe(8);
  moveConflict(view!, 1);
  expect(line()).toBe(2); // wrapped
  moveConflict(view!, -1);
  expect(line()).toBe(8);
  view!.destroy();
  mount("clean\nfile\n");
  expect(moveConflict(view!, 1)).toBe(false);
});
