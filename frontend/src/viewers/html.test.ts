import { describe, expect, test } from "vitest";
import { viewerFor, PREVIEW } from "../core/viewers";
import "./html";

describe("html preview viewer", () => {
  test("viewerFor matches preview:// scheme", () => {
    const v = viewerFor(`${PREVIEW}index.html`);
    expect(v).toBeDefined();
    expect(v?.id).toBe("html-preview");
  });

  test("viewerFor matches preview:// with subfolders", () => {
    const v = viewerFor(`${PREVIEW}docs/guide/index.html`);
    expect(v).toBeDefined();
    expect(v?.id).toBe("html-preview");
  });

  test("normal html files are not claimed as default viewer", () => {
    // Normal .html files open in the code editor, not in a viewer
    const v = viewerFor("index.html");
    expect(v).toBeUndefined();
  });
});
