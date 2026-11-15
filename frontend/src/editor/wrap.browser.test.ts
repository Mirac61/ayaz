import { afterEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorExtensions, isWrapped, setWrap } from "./editor";
import { installVim } from "./vim/setup";
import { defaultKeymap } from "../core/keymap";

installVim(() => {}, defaultKeymap().filter((b) => b.context === "normal"), () => {}); // our gj/gk

let view: EditorView | null = null;
afterEach(() => {
  const box = view?.dom.parentElement;
  view?.destroy();
  box?.remove();
  view = null;
  localStorage.removeItem("ayaz.wrap");
});

// M22: with wrap, j/k move by logical lines like nvim, gj/gk by screen lines.
test("j/k over logical lines, gj/gk over wrapped ones", async () => {
  const el = document.createElement("div");
  el.style.cssText = "height:300px;width:300px";
  document.body.append(el);
  const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
  view = new EditorView({ parent: el, state: EditorState.create({ doc: `${long}\nnext\n`, extensions: [editorExtensions(), EditorView.lineWrapping] }) });
  view.focus();
  const line = () => view!.state.doc.lineAt(view!.state.selection.main.head).number;
  const head = () => view!.state.selection.main.head;

  await userEvent.keyboard("j");
  expect(line()).toBe(2);
  await userEvent.keyboard("k");
  expect(head()).toBe(0);
  await userEvent.keyboard("gj");
  expect(line()).toBe(1); // the second screen row of line 1
  expect(head()).toBeGreaterThan(0);
  const row2 = head();
  await userEvent.keyboard("gk"); // M40: from the row's very start too, not only from inside it
  expect(head()).toBe(0);
  await userEvent.keyboard("gj");
  expect(head()).toBe(row2);
  await userEvent.keyboard("ll");
  expect(head()).toBe(row2 + 2);
  await userEvent.keyboard("gk");
  expect(head()).toBe(2);
  await userEvent.keyboard("2gj"); // a count, and the column stays
  expect(head()).toBeGreaterThan(row2 + 2);
  expect(line()).toBe(1);
});

test("setWrap turns wrapping on and off and remembers it", () => {
  view = new EditorView({ state: EditorState.create({ extensions: editorExtensions() }) });
  view.dispatch({ effects: setWrap(true) });
  expect(localStorage.getItem("ayaz.wrap")).toBe("on");
});

test("isWrapped reads the compartment", async () => {
  const { createState } = await import("./editor");
  expect(isWrapped(await createState("a.md", "x"))).toBe(true);
  expect(isWrapped(await createState("a.go", "x"))).toBe(false);
  localStorage.setItem("ayaz.wrap", "on");
  expect(isWrapped(await createState("a.go", "x"))).toBe(true);
});
