import { describe, expect, it } from "vitest";
import { DOC_ITEMS } from "../docs/docsData";
import { isEx } from "../editor/vim/setup";

describe("DocsHub & In-App Documentation", () => {
  it("provides structured documentation items without emojis", () => {
    expect(DOC_ITEMS.length).toBeGreaterThan(4);

    for (const doc of DOC_ITEMS) {
      expect(doc.id).toBeTruthy();
      expect(doc.title).toBeTruthy();
      expect(doc.category).toBeTruthy();
      expect(doc.content).toBeTruthy();
      expect(doc.icon).toBeDefined();

      // Ensure titles do not contain unicode emojis
      expect(/[\u{1F300}-\u{1F9FF}]/u.test(doc.title)).toBe(false);
    }
  });

  it("includes essential getting started and cheat sheet guides", () => {
    const ids = DOC_ITEMS.map((d) => d.id);
    expect(ids).toContain("getting-started");
    expect(ids).toContain("keymap-commands");
    expect(ids).toContain("git-suite");
    expect(ids).toContain("architecture");
  });

  it("correctly triggers DocsHub from vim Ex commands :help, :h and :docs", () => {
    expect(isEx("help")).toBe(true);
    expect(isEx("h")).toBe(true);
    expect(isEx("docs")).toBe(true);
  });

  it("filters documentation items accurately by keyword", () => {
    const query = "git";
    const matched = DOC_ITEMS.filter(
      (d) =>
        d.title.toLowerCase().includes(query) ||
        d.category.toLowerCase().includes(query) ||
        d.content.toLowerCase().includes(query),
    );

    expect(matched.length).toBeGreaterThan(0);
    expect(matched.some((d) => d.id === "git-suite")).toBe(true);
  });
});
