import { describe, expect, it } from "vitest";
import { DOC_ITEMS, DOCS_INDEX, docFiles, docPath, docText, findDoc } from "./docsData";
import { isVirtual } from "../core/buffers";
import { isEx } from "../editor/vim/setup";

describe("in-app docs", () => {
  it("has the core topics, each with text", () => {
    const ids = DOC_ITEMS.map((d) => d.id);
    for (const id of ["getting-started", "keymap-commands", "git-suite", "architecture"]) expect(ids).toContain(id);
    for (const d of DOC_ITEMS) expect(d.content).toBeTruthy();
  });

  it("drops images and badges the app can't show", () => {
    for (const d of DOC_ITEMS) expect(d.content).not.toMatch(/^\[?!\[/m);
  });

  it("maps docs:// paths to text, virtual and read-only", () => {
    expect(isVirtual(DOCS_INDEX)).toBe(true);
    expect(docText(DOCS_INDEX)).toContain(`(${DOC_ITEMS[0].id}.md)`);
    expect(docText(docPath("git-suite"))).toBe(DOC_ITEMS.find((d) => d.id === "git-suite")!.content);
    expect(docText(docPath("nope"))).toContain("no docs topic");
  });

  it("finds a topic for :help <topic>", () => {
    expect(findDoc("git-suite")?.id).toBe("git-suite");
    expect(findDoc("Git")?.id).toBe("git-suite");
    expect(findDoc("zzz")).toBeUndefined();
    expect(isEx("help")).toBe(true);
    expect(isEx("h")).toBe(true);
  });

  it("writes one .md per topic plus the index for the docs folder", () => {
    const files = docFiles();
    expect(Object.keys(files)).toHaveLength(DOC_ITEMS.length + 1);
    expect(files["index.md"]).toBe(docText(DOCS_INDEX));
  });
});
