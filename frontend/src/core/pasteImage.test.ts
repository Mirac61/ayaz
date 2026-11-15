import { expect, test } from "vitest";
import { imageTarget } from "./pasteImage";

const at = new Date(2026, 10, 11, 9, 5, 7);

test("the image lands in assets/ beside the Markdown file and is linked relative to it", () => {
  expect(imageTarget("notes/day.md", "image/png", at)).toEqual({ path: "notes/assets/image-20261111-090507.png", link: "assets/image-20261111-090507.png" });
  expect(imageTarget("README.md", "image/jpeg", at)?.path).toBe("assets/image-20261111-090507.jpg");
});

test("only types a browser shows are taken", () => {
  expect(imageTarget("a.md", "image/tiff", at)).toBeNull();
  expect(imageTarget("a.md", "text/plain", at)).toBeNull();
});
