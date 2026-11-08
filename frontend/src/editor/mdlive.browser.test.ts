import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { EditorView } from "@codemirror/view";
import { createState } from "./editor";
import { toggleReading } from "./mdlive";
import { installVim } from "./vim/setup";
import { defaultKeymap } from "../core/keymap";

const ran: string[] = [];
installVim((id) => void ran.push(id), defaultKeymap().filter((b) => b.context === "normal"), () => {});

let view: EditorView | null = null;
afterEach(() => {
  const box = view?.dom.parentElement;
  view?.destroy();
  box?.remove();
  view = null;
  ran.length = 0;
});

async function mount(doc: string) {
  const el = document.createElement("div");
  el.style.cssText = "height:300px;width:500px";
  document.body.append(el);
  view = new EditorView({ parent: el, state: await createState("note.md", doc) });
  view.focus();
  return view;
}

const lines = () => [...view!.contentDOM.querySelectorAll(".cm-line")].map((l) => l.textContent);

// M5 done-when: markers show only on the cursor line, and j/k move over lines with hidden markers.
test("markers follow the cursor with j/k", async () => {
  await mount("# Title\nplain\nsome **bold** and `code` [link](https://x.org)");
  expect(lines()).toEqual(["# Title", "plain", "some bold and code link"]);
  await userEvent.keyboard("j");
  expect(lines()).toEqual(["Title", "plain", "some bold and code link"]);
  await userEvent.keyboard("j");
  expect(lines()).toEqual(["Title", "plain", "some **bold** and `code` [link](https://x.org)"]);
  expect(view!.state.doc.lineAt(view!.state.selection.main.head).number).toBe(3);
  await userEvent.keyboard("kk");
  expect(lines()).toEqual(["# Title", "plain", "some bold and code link"]);
  expect(view!.contentDOM.querySelector(".cm-md-h1")).not.toBeNull();
});

test("the cursor column survives a trip over a line with hidden markers", async () => {
  await mount("abcdefghij\n**ab** cdefgh\nabcdefghij");
  await userEvent.keyboard("5ljj");
  const st = view!.state, head = st.selection.main.head;
  expect([st.doc.lineAt(head).number, head - st.doc.lineAt(head).from]).toEqual([3, 5]);
});

test("gx, gf and the resize keys run their commands", async () => {
  await mount("[a](b.md)");
  await userEvent.keyboard("gxgf");
  await userEvent.keyboard("{Control>}w{/Control}<{Control>}w{/Control}>{Control>}w{/Control}+{Control>}w{/Control}-{Control>}w{/Control}=");
  expect(ran).toEqual(["link.browser", "link.file", "pane.narrower", "pane.wider", "pane.taller", "pane.shorter", "pane.equal"]);
});

test("reading view: everything rendered, Vim moves but cannot edit", async () => {
  await mount("# Title\nsome **bold** text\nend");
  expect(toggleReading(view!)).toBe(true);
  expect(lines()).toEqual(["Title", "some bold text", "end"]);
  expect(view!.dom.classList.contains("cm-reading")).toBe(true);
  await userEvent.keyboard("j");
  expect(view!.state.doc.lineAt(view!.state.selection.main.head).number).toBe(2);
  expect(lines()).toEqual(["Title", "some bold text", "end"]);
  await userEvent.keyboard("x");
  expect(view!.state.doc.toString()).toBe("# Title\nsome **bold** text\nend");
  expect(toggleReading(view!)).toBe(false);
  expect(lines()).toEqual(["Title", "some **bold** text", "end"]);
  await userEvent.keyboard("x");
  expect(view!.state.doc.toString()).not.toBe("# Title\nsome **bold** text\nend");
});

test("fenced code gets its language's highlighting and a background", async () => {
  await mount("```go\nfunc main() {}\n```");
  await vi.waitFor(() => expect(view!.contentDOM.querySelectorAll(".cm-md-code-line span[class]").length).toBeGreaterThan(0));
  expect(view!.contentDOM.querySelectorAll(".cm-md-code-line").length).toBe(3);
  expect(view!.contentDOM.querySelectorAll(".cm-md-fence").length).toBe(2);
  expect(lines()).toEqual(["```go", "func main() {}", "```"]);
});
