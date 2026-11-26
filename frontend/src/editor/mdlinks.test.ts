import { expect, test } from "vitest";
import { encodeLink, linkAt, relPath } from "./mdlinks";

test("relPath writes the link from one file to another", () => {
  expect(relPath("docs/spec/test-design.md", "docs/spec/assets/a.png")).toBe("./assets/a.png");
  expect(relPath("docs/spec/test-design.md", "docs/context.md")).toBe("../context.md");
  expect(relPath("docs/spec/test-design.md", "backend/x/y.go")).toBe("../../backend/x/y.go");
  expect(relPath("README.md", "docs/a.md")).toBe("./docs/a.md");
  expect(relPath("docs/a.md", "docs/b.md")).toBe("./b.md");
});

test("encodeLink keeps a file name from breaking its link", () => {
  expect(encodeLink("./my file (1).md")).toBe("./my%20file%20%281%29.md");
  expect(encodeLink("./c# 100%.md")).toBe("./c%23%20100%25.md");
  expect(decodeURIComponent(encodeLink("../a?<b>.md"))).toBe("../a?<b>.md");
});

test("linkAt finds the path being typed and whether it is an image", () => {
  expect(linkAt("see [a](./as")).toEqual({ typed: "./as", image: false });
  expect(linkAt("![alt](")).toEqual({ typed: "", image: true });
  expect(linkAt("![[./a")).toEqual({ typed: "./a", image: true });
  expect(linkAt("[[no")).toEqual({ typed: "no", image: false });
  expect(linkAt("[a](b.md) text")).toBeNull();
  expect(linkAt("plain (text")).toBeNull();
});
