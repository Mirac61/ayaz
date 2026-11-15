import { describe, expect, it } from "vitest";
import { DOC_ITEMS, findDoc, findDocIn, matchDoc, type DocItem } from "../docs/docsData";
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

  it("filters documentation items accurately using matchDoc", () => {
    const query = "git";
    const matched = DOC_ITEMS.filter((d) => matchDoc(d, query));

    expect(matched.length).toBeGreaterThan(0);
    expect(matched.some((d) => d.id === "git-suite")).toBe(true);
  });

  it("verifies findDoc priority: exact-ID, partial-ID, then title lookup order", () => {
    const mockItems: DocItem[] = [
      {
        id: "git",
        title: "Version Control Overview",
        category: "Getting Started",
        content: "Git basics",
        icon: {} as any,
      },
      {
        id: "git-advanced",
        title: "Version Control Deep Dive",
        category: "Development & Tools",
        content: "Rebase and cherry-pick",
        icon: {} as any,
      },
      {
        id: "other-topic",
        title: "Git and GitHub Integrations",
        category: "Editor & Navigation",
        content: "Integration guides",
        icon: {} as any,
      },
    ];

    // 1. Exact ID wins over partial ID and title match
    expect(findDocIn(mockItems, "git")?.id).toBe("git");

    // 2. Partial ID wins over title match
    expect(findDocIn(mockItems, "advanced")?.id).toBe("git-advanced");

    // 3. Title match is chosen when neither exact nor partial ID matches
    expect(findDocIn(mockItems, "Integrations")?.id).toBe("other-topic");

    // Production items sanity check
    expect(findDoc("git-suite")?.id).toBe("git-suite");
    expect(findDoc("keymap")?.id).toBe("keymap-commands");
  });
});
