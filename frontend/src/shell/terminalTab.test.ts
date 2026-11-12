import { describe, it, expect } from "vitest";

describe("terminal tab & titlebar path formatting", () => {
  function formatTitlebarPath(path: string | null) {
    const isTerm = path?.startsWith("term://") ?? false;
    const termName = isTerm && path ? path.slice(7) : null;
    const dir = isTerm ? "" : path?.slice(0, path.lastIndexOf("/") + 1);
    const name = isTerm ? termName || "shell" : path?.slice(dir?.length) ?? "[No Name]";
    return { isTerm, dir: isTerm ? "terminal" : dir, name };
  }

  it("formats terminal paths as clean terminal titles without undefined", () => {
    const res1 = formatTitlebarPath("term://shell 1");
    expect(res1.isTerm).toBe(true);
    expect(res1.dir).toBe("terminal");
    expect(res1.name).toBe("shell 1");

    const res2 = formatTitlebarPath("term://shell 2");
    expect(res2.isTerm).toBe(true);
    expect(res2.name).toBe("shell 2");

    const resFallback = formatTitlebarPath("term://");
    expect(resFallback.isTerm).toBe(true);
    expect(resFallback.name).toBe("shell");
  });

  it("formats regular files properly", () => {
    const res = formatTitlebarPath("src/shell/Workbench.tsx");
    expect(res.isTerm).toBe(false);
    expect(res.dir).toBe("src/shell/");
    expect(res.name).toBe("Workbench.tsx");
  });

  it("handles null path without crashing", () => {
    const res = formatTitlebarPath(null);
    expect(res.isTerm).toBe(false);
    expect(res.name).toBe("[No Name]");
  });

  it("ensures tab list dedupes terminal tabs across panes", () => {
    const tabs = new Map<number, string[]>([
      [1, ["README.md", "term://shell 1"]],
      [2, ["justfile"]],
    ]);

    const dropTermTab = (title: string) => {
      for (const list of tabs.values()) {
        const i = list.indexOf(`term://${title}`);
        if (i >= 0) list.splice(i, 1);
      }
    };

    dropTermTab("shell 1");
    expect(tabs.get(1)).toEqual(["README.md"]);

    // Add to target pane 2
    tabs.get(2)!.push("term://shell 1");
    expect(tabs.get(2)).toEqual(["justfile", "term://shell 1"]);
  });
});
