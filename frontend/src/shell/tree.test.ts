import { expect, test } from "vitest";
import { filterRows, GIT_BADGE } from "./Tree";

test("GIT_BADGE maps git status codes to readable letters", () => {
  expect(GIT_BADGE["M"]).toBe("M");
  expect(GIT_BADGE["A"]).toBe("A");
  expect(GIT_BADGE["?"]).toBe("U");
  expect(GIT_BADGE["U"]).toBe("C");
  expect(GIT_BADGE["!"]).toBeUndefined();
});

test("filter matches become a tree: folders first, by name, each folder once", () => {
  const rows = filterRows(["src/b.go", "README.md", "src/a/x.go", "src/a.go"]);
  expect(rows.map((r) => `${"  ".repeat(r.depth)}${r.name}${r.dir ? "/" : ""}`)).toEqual([
    "src/", "  a/", "    x.go", "  a.go", "  b.go", "README.md",
  ]);
  expect(rows[2].path).toBe("src/a/x.go");
  expect(filterRows([])).toEqual([]);
});
