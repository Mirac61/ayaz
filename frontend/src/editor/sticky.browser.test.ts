import { afterEach, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { go } from "@codemirror/lang-go";
import { editorExtensions } from "./editor";

let view: EditorView | null = null;
afterEach(() => {
  const box = view?.dom.parentElement;
  view?.destroy();
  box?.remove();
  view = null;
});

// A method with 60 lines, then another one: scrolling into the first shows its signature on top.
const body = (n: number) => Array.from({ length: n }, (_, i) => `\tuse(${i})`).join("\n");
const head = "package p\n\ntype T struct{}\n\nfunc (t T) long(a int) int {\n";
const SRC = `${head}${body(60)}\n\treturn 1\n}\n\nfunc (t T) next() {\n${body(40)}\n}\n`;

function mount() {
  const el = document.createElement("div");
  el.style.cssText = "height:240px;width:600px";
  document.body.append(el);
  view = new EditorView({ parent: el, state: EditorState.create({ doc: SRC, extensions: [editorExtensions(), go()] }) });
  return el;
}

const rows = (el: HTMLElement) => [...el.querySelectorAll(".cm-sticky-row")].map((r) => r.textContent);
const scrollTo = (v: EditorView, line: number) => {
  v.scrollDOM.scrollTop = v.lineBlockAt(v.state.doc.line(line).from).top;
};

test("sticky scroll shows the function whose start scrolled away, and follows into the next one", async () => {
  const el = mount();
  expect(rows(el)).toEqual([]);
  scrollTo(view!, 30);
  await expect.poll(() => rows(el)).toEqual(["func (t T) long(a int) int"]);
  scrollTo(view!, 90); // inside next()
  await expect.poll(() => rows(el)).toEqual(["func (t T) next()"]);
  scrollTo(view!, 1);
  await expect.poll(() => rows(el)).toEqual([]);
});

test("a click on a row jumps to the function", async () => {
  const el = mount();
  scrollTo(view!, 30);
  await expect.poll(() => rows(el).length).toBe(1);
  el.querySelector(".cm-sticky-row")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  expect(view!.state.doc.lineAt(view!.state.selection.main.head).text).toBe("func (t T) long(a int) int {");
});
