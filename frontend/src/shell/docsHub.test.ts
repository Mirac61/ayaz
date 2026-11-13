import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { DocsHub } from "./DocsHub";
import { DOC_ITEMS } from "../docs/docsData";

describe("DocsHub", () => {
  it("renders the documentation hub with header, brand, and search", () => {
    const html = renderToString(createElement(DocsHub, { onClose: () => {} }));
    expect(html).toContain("docs-container");
    expect(html).toContain("Ayaz Documentation Hub");
    expect(html).toContain("docs-search-input");
    expect(html).toContain("Search docs, keys &amp; commands...");
    expect(html).toContain("v0.5.0");
  });

  it("lists all documentation categories and items in sidebar", () => {
    const html = renderToString(createElement(DocsHub, { onClose: () => {} }));
    expect(html).toContain("Getting Started");
    expect(html).toContain("Editor &amp; Navigation");
    expect(html).toContain("Development &amp; Tools");
    expect(html).toContain("Engineering &amp; Roadmap");
    for (const item of DOC_ITEMS) {
      expect(html).toContain(item.title.replace(/&/g, "&amp;"));
    }
  });

  it("renders initial selected document or first doc markdown", () => {
    const html = renderToString(createElement(DocsHub, { initialDocId: "keymap-commands", onClose: () => {} }));
    expect(html).toContain("Keymap &amp; Command Cheatsheet");
    expect(html).toContain("Ayaz Keymap &amp; Commands Reference");
    expect(html).toContain("find.files");
  });
});
