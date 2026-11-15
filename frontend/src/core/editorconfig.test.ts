import { describe, expect, test } from "vitest";
import { indentFromConfig, parseEditorConfig } from "./editorconfig";

const cfg = parseEditorConfig(`
root = true
# comment
[*]
indent_style = space
indent_size = 2

[*.{go,mk}]
indent_style = tab
indent_size = tab
tab_width = 8

[src/legacy/**.js]
indent_size = 4
`);

describe("editorconfig", () => {
  test("later sections win, a glob without a slash matches at any depth", () => {
    expect(indentFromConfig(cfg, "a.ts")).toEqual({ tabs: false, size: 2, tabWidth: 2 });
    expect(indentFromConfig(cfg, "deep/dir/main.go")).toEqual({ tabs: true, size: undefined, tabWidth: 8 });
    expect(indentFromConfig(cfg, "Makefile.mk")).toMatchObject({ tabs: true });
  });
  test("a glob with a slash is anchored to the root", () => {
    expect(indentFromConfig(cfg, "src/legacy/x/y.js").size).toBe(4);
    expect(indentFromConfig(cfg, "other/src/legacy/y.js").size).toBe(2);
  });
  test("nothing matches: empty", () => {
    expect(indentFromConfig([], "a.ts")).toEqual({ tabs: undefined, size: undefined, tabWidth: undefined });
  });
});
