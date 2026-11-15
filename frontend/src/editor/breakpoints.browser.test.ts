import { afterEach, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorExtensions } from "./editor";
import { breakpointLines, setLines, toggleBreakpoint, toggleBreakpointAt } from "./breakpoints";

let view: EditorView | null = null;
afterEach(() => {
  const box = view?.dom.parentElement;
  view?.destroy();
  box?.remove();
  view = null;
});

function mount(doc = "one\ntwo\nthree\nfour\n") {
  const el = document.createElement("div");
  document.body.append(el);
  view = new EditorView({ parent: el, state: EditorState.create({ doc, extensions: [editorExtensions()] }) });
  return el;
}
// The spacer keeps the column's width and is hidden: only the dots of lines count.
const dots = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(".cm-bp .cm-gutterElement")]
  .filter((e) => !e.style.visibility && e.querySelector(".cm-bp-dot"));
const cursorAt = (line: number) => view!.dispatch({ selection: { anchor: view!.state.doc.line(line).from + 1 } });
const lines = () => breakpointLines(view!.state);

test("toggling puts a dot on the cursor line and takes it off again", () => {
  const el = mount();
  cursorAt(2);
  expect(toggleBreakpoint(view!)).toBe(true);
  expect(lines()).toEqual([2]);
  expect(dots(el)).toHaveLength(1);
  cursorAt(4);
  toggleBreakpoint(view!);
  expect(lines()).toEqual([2, 4]);
  cursorAt(2);
  expect(toggleBreakpoint(view!)).toBe(false);
  expect(lines()).toEqual([4]);
  expect(dots(el)).toHaveLength(1);
});

test("the dots follow edits: lines inserted above push them down, a deleted line takes its dot", () => {
  mount();
  view!.dispatch({ effects: setLines.of([2, 4]) });
  view!.dispatch({ changes: { from: 0, insert: "new\n" } });
  expect(lines()).toEqual([3, 5]);
  const two = view!.state.doc.line(3); // "two", where the first dot is
  view!.dispatch({ changes: { from: two.from, to: two.to + 1 } }); // delete the line and its break
  expect(lines()).toEqual([4]); // "four" has moved up to line 4
  expect(view!.state.doc.line(4).text).toBe("four");
});

test("toggleBreakpointAt sets and removes breakpoint on specified line", () => {
  mount();
  expect(toggleBreakpointAt(view!, 3)).toBe(true);
  expect(lines()).toEqual([3]);
  expect(toggleBreakpointAt(view!, 3)).toBe(false);
  expect(lines()).toEqual([]);
});

test("typing in a line and splitting it keep the dot with the text", () => {
  mount();
  view!.dispatch({ effects: setLines.of([2]) });
  view!.dispatch({ changes: { from: view!.state.doc.line(2).to, insert: "!" } }); // at the end of "two"
  expect(lines()).toEqual([2]);
  view!.dispatch({ changes: { from: view!.state.doc.line(2).from, insert: "\n" } }); // Enter at its start
  expect(lines()).toEqual([3]);
  expect(view!.state.doc.line(3).text).toBe("two!");
});

test("setLines clamps to the document and drops duplicates", () => {
  mount("a\nb");
  view!.dispatch({ effects: setLines.of([0, 2, 2, 9]) });
  expect(lines()).toEqual([1, 2]);
});
