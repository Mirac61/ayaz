import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { createState } from "./editor";
import { mdOutline, toggleReading } from "./mdlive";
import { revealHeading } from "./mdrender";
import { installVim } from "./vim/setup";
import { defaultKeymap } from "../core/keymap";

const ran: string[] = [];
installVim(
  (id) => void ran.push(id),
  defaultKeymap().filter((b) => b.context === "normal"),
  () => {},
);

let view: EditorView | null = null;
afterEach(() => {
  const box = view?.dom.parentElement;
  view?.destroy();
  box?.remove();
  view = null;
  ran.length = 0;
});

async function mount(doc: string, ws?: string) {
  const el = document.createElement("div");
  el.style.cssText = "height:300px;width:500px";
  document.body.append(el);
  view = new EditorView({ parent: el, state: await createState("note.md", doc, ws) });
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
  const st = view!.state,
    head = st.selection.main.head;
  expect([st.doc.lineAt(head).number, head - st.doc.lineAt(head).from]).toEqual([3, 5]);
});

test("gx, gf and the resize keys run their commands", async () => {
  await mount("[a](b.md)");
  await userEvent.keyboard("gxgf");
  await userEvent.keyboard(
    "{Control>}w{/Control}<{Control>}w{/Control}>{Control>}w{/Control}+{Control>}w{/Control}-{Control>}w{/Control}=",
  );
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
  expect(lines()).toEqual(["```go", "func main() {}", ""]); // the cursor line keeps its fence, the other one hides
});

test("quotes lose their mark, bullets become dots, the cursor line stays raw", async () => {
  await mount("plain\n> quote\n- item\n1. one");
  expect(lines()).toEqual(["plain", "quote", "• item", "1. one"]);
  expect(view!.contentDOM.querySelectorAll(".cm-md-quote").length).toBe(1);
  await userEvent.keyboard("jj");
  expect(lines()).toEqual(["plain", "quote", "- item", "1. one"]);
});

test("clicking a checkbox flips the x, undo brings it back", async () => {
  await mount("end\n- [ ] one\n- [x] two");
  const boxes = () => [...view!.contentDOM.querySelectorAll<HTMLInputElement>(".cm-md-check")];
  expect(boxes().map((b) => b.checked)).toEqual([false, true]);
  await userEvent.click(boxes()[0]);
  expect(view!.state.doc.toString()).toBe("end\n- [x] one\n- [x] two");
  expect(boxes().map((b) => b.checked)).toEqual([true, true]);
  await userEvent.click(boxes()[1]);
  expect(view!.state.doc.toString()).toBe("end\n- [x] one\n- [ ] two");
  await userEvent.keyboard("{Escape}u");
  expect(view!.state.doc.toString()).toBe("end\n- [x] one\n- [x] two");
});

test("a reading view does not toggle checkboxes", async () => {
  await mount("- [ ] one\nend");
  toggleReading(view!);
  await userEvent.click(view!.dom.querySelector(".md-render li.task")!); // the rendered view lies over the text
  expect(view!.state.doc.toString()).toBe("- [ ] one\nend");
});

const doc3 = "above\n\n| a | b |\n|---|---|\n| 1 | <i>2</i> |\n\nbelow";
const tableEl = () => view!.contentDOM.querySelector<HTMLElement>(".cm-md-table");
const head = () => view!.state.doc.lineAt(view!.state.selection.main.head).number;

test("a table renders as HTML outside the cursor, j and k go in and out of it", async () => {
  await mount(doc3);
  expect(tableEl()).not.toBeNull();
  expect([...tableEl()!.querySelectorAll("th, td")].map((c) => c.textContent)).toEqual(["a", "b", "1", "<i>2</i>"]);
  expect(tableEl()!.querySelector("i")).toBeNull(); // text, never markup
  expect(lines().filter((l) => l?.includes("|"))).toEqual([]);
  await userEvent.keyboard("jj"); // blank line, then into the table
  expect(tableEl()).toBeNull();
  expect(lines().filter((l) => l?.includes("|")).length).toBe(3);
  expect(head()).toBeGreaterThanOrEqual(3);
  expect(head()).toBeLessThanOrEqual(5);
  await userEvent.keyboard("kk");
  expect(head()).toBe(1);
  expect(tableEl()).not.toBeNull();
});

test("k from below enters the table too", async () => {
  await mount(doc3);
  await userEvent.keyboard("G"); // "below"
  expect(head()).toBe(7);
  expect(tableEl()).not.toBeNull();
  await userEvent.keyboard("kk");
  expect(tableEl()).toBeNull();
  expect(head()).toBeGreaterThanOrEqual(3);
  expect(head()).toBeLessThanOrEqual(5);
  await userEvent.keyboard("jj");
  expect(head()).toBe(7);
  expect(tableEl()).not.toBeNull();
});

test("clicking a table shows its source; the reading view keeps it rendered", async () => {
  await mount(doc3);
  await userEvent.click(tableEl()!.querySelector("td")!);
  expect(tableEl()).toBeNull();
  toggleReading(view!);
  expect(tableEl()).not.toBeNull();
});

test("a rule reads as a line and is raw under the cursor", async () => {
  await mount("x\n\n---\n\nb");
  expect(lines()).toEqual(["x", "", "", "", "b"]);
  expect(view!.contentDOM.querySelectorAll(".cm-md-hr").length).toBe(1);
  await userEvent.keyboard("jj");
  expect(lines()).toEqual(["x", "", "---", "", "b"]);
  expect(view!.contentDOM.querySelector(".cm-md-hr")).toBeNull();
});

test("an image shows as <img> through /fs/, raw while the cursor is on it", async () => {
  await mount("![logo](a/pic.png)\ntext", "w1");
  await userEvent.keyboard("j");
  const img = view!.contentDOM.querySelector<HTMLImageElement>(".cm-md-img")!;
  expect(img.getAttribute("src")).toBe("/fs/w1/a/pic.png");
  expect(img.alt).toBe("logo");
  await userEvent.keyboard("k");
  expect(view!.contentDOM.querySelector(".cm-md-img")).toBeNull();
  expect(lines()[0]).toBe("![logo](a/pic.png)");
});

test("table cells show code and emphasis, links, images and raw HTML stay text", async () => {
  await mount(
    "above\n\n| key | what |\n|---|---|\n| `<Space>cr` | **rename** [doc](https://x.org) <b>no</b> ![logo](https://x.org/p.png) |\n\nbelow",
  );
  const td = [...tableEl()!.querySelectorAll("td")];
  expect(td[0].querySelector("code")?.textContent).toBe("<Space>cr");
  expect(td[1].querySelector("strong")?.textContent).toBe("rename");
  expect(td[1].querySelector("a")).toBeNull(); // no link to navigate the webview away from the app
  expect(td[1].textContent).toContain("doc");
  expect(td[1].querySelector("img")).toBeNull(); // nothing loads from the app origin or the network
  expect(td[1].textContent).toContain("logo"); // the alt text stays
  expect(td[1].querySelector("b")).toBeNull();
  expect(td[1].textContent).toContain("<b>no</b>");
});

test("a reading view table keeps every column readable next to a long one", async () => {
  const long = "a long description that goes on and on ".repeat(8);
  await mount(`| Area | What you get |\n|:---:|:---:|\n| Languages | ${long} |\n`);
  toggleReading(view!);
  const th = view!.dom.querySelector<HTMLElement>(".md-render th")!;
  expect(th.getBoundingClientRect().width).toBeGreaterThan(th.scrollWidth - 1);
  expect(th.getBoundingClientRect().height).toBeLessThan(40); // "Area" on one line, not a letter per line
});

test("the outline's headings scroll the reading view, also the second of two equal ones", async () => {
  const body = "text\n\n".repeat(30);
  await mount(`# Top\n\n${body}## Features\n\n${body}## Features\n\n${body}`);
  toggleReading(view!);
  const box = view!.dom.querySelector<HTMLElement>(".md-render")!;
  expect(mdOutline(view!.state).headings.map((h) => h.text)).toEqual(["Top", "Features", "Features"]);
  expect(revealHeading(view!, 2)).toBe(true); // the second "Features"
  const second = box.querySelectorAll("h2")[1];
  expect(Math.abs(second.getBoundingClientRect().top - box.getBoundingClientRect().top)).toBeLessThan(40);
  expect(revealHeading(view!, 9)).toBe(false);
});

test("a heading whose slug another one shares still scrolls to its own place", async () => {
  const body = "text\n\n".repeat(30);
  await mount(`# API\n\n${body}## API?\n\n${body}## C++\n\n${body}## C\n\n${body}`);
  toggleReading(view!);
  const box = view!.dom.querySelector<HTMLElement>(".md-render")!;
  const at = (h: Element) => Math.abs(h.getBoundingClientRect().top - box.getBoundingClientRect().top) < 40;
  expect([...box.querySelectorAll("h1, h2")].map((h) => h.id)).toEqual(["api", "api-1", "c", "c-1"]); // unique
  expect(revealHeading(view!, 1)).toBe(true); // "API?", not "API"
  expect(at(box.querySelectorAll("h1, h2")[1])).toBe(true);
  expect(revealHeading(view!, 3)).toBe(true); // "C", not "C++"
  expect(at(box.querySelectorAll("h1, h2")[3])).toBe(true);
});

test("a live table keeps every column readable next to a long one, also with line wrap", async () => {
  const long = "a long description that goes on and on ".repeat(8);
  await mount(`above\n\n| Area | What you get |\n|---|---|\n| Languages | ${long} |\n`);
  view!.dispatch({ effects: StateEffect.appendConfig.of(EditorView.lineWrapping) });
  const th = tableEl()!.querySelector<HTMLElement>("th")!;
  expect(th.getBoundingClientRect().height).toBeLessThan(40); // "Area" on one line
});
