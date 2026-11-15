import { describe, expect, test } from "vitest";
import { detectIndent } from "./indent";

describe("detectIndent", () => {
  test("tabs, 2 and 4 spaces", () => {
    expect(detectIndent("a {\n\tb\n\tc\n\t\td\n}")).toEqual({ tabs: true });
    expect(detectIndent("a:\n  b:\n    c: 1\n    d: 2\n  e:\n    f: 3\n")).toEqual({ tabs: false, width: 2 });
    expect(detectIndent("if x {\n    a\n    if y {\n        b\n    }\n    if z {\n        c\n    }\n}")).toEqual({ tabs: false, width: 4 });
  });
  test("too little to tell", () => {
    expect(detectIndent("a\nb\n")).toBeNull();
    expect(detectIndent("a\n  b\n")).toBeNull();
  });
});
