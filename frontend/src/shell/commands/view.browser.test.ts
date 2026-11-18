import { afterEach, expect, test, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { createState } from "../../editor/editor";
import { mdOutline, toggleReading } from "../../editor/mdlive";
import type { PickerSource } from "../Picker";
import type { Ctx } from "./context";
import { viewCommands } from "./view";

// The picker ranks through the Go matcher, which a browser test does not have; a substring match is enough here.
vi.mock("../../core/backend", () => ({
  backend: {
    rank: async (items: string[], q: string) =>
      items.filter((i) => i.toLowerCase().includes(q.toLowerCase())).map((path) => ({ path, positions: [] })),
    openURL: async () => {},
  },
}));

const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length) {
    cleanup.pop()!();
  }
});

async function setup(doc: string, file = "note.md") {
  const el = document.createElement("div");
  el.style.cssText = "height:300px;width:500px";
  document.body.append(el);
  const view = new EditorView({ parent: el, state: await createState(file, doc) });
  cleanup.push(() => {
    view.destroy();
    el.remove();
  });
  let picker: PickerSource | null = null;
  const fails: string[] = [];
  const c = {
    ed: { activeView: () => view },
    say: () => {},
    fail: (m: string) => void fails.push(m),
    setPicker: (p: PickerSource | null) => void (picker = p),
  } as unknown as Ctx;
  const run = () =>
    viewCommands(c)
      .find((x) => x.id === "md.outline")!
      .run();
  return { view, run, fails, picker: () => picker! };
}

test("equal titles each get their own heading, and the pick jumps there", async () => {
  const body = "text\n\n".repeat(30);
  const { view, run, picker } = await setup(`# Top\n\n${body}## Features\n\n${body}## Features\n\n${body}`);
  const hs = mdOutline(view.state).headings;
  run();
  const src = picker();
  expect(src.start).toBe(0); // the cursor sits under "Top"
  const hits = await src.query("Features", () => {});
  expect(hits.map((i) => i.hint)).toEqual([`:${hs[1].line}`, `:${hs[2].line}`]); // one match per heading, not twice the first
  toggleReading(view); // the outline scrolls the reading view, which covers the editor
  src.pick(hits[1], 1);
  expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(hs[2].line);
  const box = view.dom.querySelector<HTMLElement>(".md-render")!;
  expect(Math.abs(box.querySelectorAll("h2")[1].getBoundingClientRect().top - box.getBoundingClientRect().top)).toBeLessThan(40);
});

test("the outline opens at the heading under the cursor", async () => {
  const { view, run, picker } = await setup("# One\n\n## Two\n\n## Three\n");
  view.dispatch({ selection: { anchor: mdOutline(view.state).headings[1].from } });
  run();
  expect(picker().start).toBe(1);
});

test("the outline says it is for Markdown files", async () => {
  const { run, fails } = await setup("package main\n", "main.go");
  run();
  expect(fails).toEqual(["The outline is for Markdown files"]);
});
