import { expect, test } from "vitest";
import { relPath } from "./mdlinks";

test("relPath writes the link from one file to another", () => {
  expect(relPath("docs/spec/test-design.md", "docs/spec/assets/a.png")).toBe("./assets/a.png");
  expect(relPath("docs/spec/test-design.md", "docs/context.md")).toBe("../context.md");
  expect(relPath("docs/spec/test-design.md", "backend/x/y.go")).toBe("../../backend/x/y.go");
  expect(relPath("README.md", "docs/a.md")).toBe("./docs/a.md");
  expect(relPath("docs/a.md", "docs/b.md")).toBe("./b.md");
});
