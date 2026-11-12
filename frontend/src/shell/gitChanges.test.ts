import { describe, expect, test } from "vitest";
import type { FileStatus } from "../../bindings/github.com/Mirac61/ayaz/internal/git";
import { GIT_BADGE } from "./Tree";

describe("GitChanges data handling", () => {
  test("filters out ignored files and maps git status codes to badges", () => {
    const rawStatus: Record<string, string> = {
      "src/main.ts": "M",
      "README.md": "M",
      "dist/bundle.js": "!",
      "new-file.txt": "?",
      "conflict.ts": "U",
    };

    const entries = Object.entries(rawStatus)
      .filter(([_, code]) => code !== "!")
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));

    expect(entries).toEqual([
      ["conflict.ts", "U"],
      ["new-file.txt", "?"],
      ["README.md", "M"],
      ["src/main.ts", "M"],
    ]);

    expect(entries.map(([_, code]) => GIT_BADGE[code] ?? code)).toEqual([
      "C",
      "U",
      "M",
      "M",
    ]);
  });

  test("empty working tree has 0 entries", () => {
    const rawStatus: Record<string, string> = {
      ".cache/x": "!",
    };
    const entries = Object.entries(rawStatus).filter(([_, code]) => code !== "!");
    expect(entries.length).toBe(0);
  });

  test("partitions detailedFiles into Staged and Unstaged changes correctly", () => {
    const files: FileStatus[] = [
      { path: "src/staged.ts", status: "A", staged: true, unstaged: false },
      { path: "src/both.ts", status: "M", staged: true, unstaged: true },
      { path: "src/worktree.ts", status: "M", staged: false, unstaged: true },
      { path: "deleted.txt", status: "D", staged: false, unstaged: true },
      { path: "untracked.ts", status: "?", staged: false, unstaged: true },
    ];

    const staged = files.filter((f) => f.staged);
    const unstaged = files.filter((f) => f.unstaged);

    expect(staged.map((f) => f.path)).toEqual(["src/staged.ts", "src/both.ts"]);
    expect(unstaged.map((f) => f.path)).toEqual([
      "src/both.ts",
      "src/worktree.ts",
      "deleted.txt",
      "untracked.ts",
    ]);

    // both.ts appears in both sections
    expect(staged.some((f) => f.path === "src/both.ts")).toBe(true);
    expect(unstaged.some((f) => f.path === "src/both.ts")).toBe(true);
  });
});
