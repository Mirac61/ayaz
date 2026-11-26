import { expect, test } from "vitest";
import { diagramKind, errorSvg, fenceKind, sized, svgSize } from "./diagram";

test("files and fences name their diagram language", () => {
  expect(diagramKind("docs/a.mmd")).toBe("mermaid");
  expect(diagramKind("a.PUML")).toBe("plantuml");
  expect(diagramKind("a.md")).toBeUndefined();
  expect(fenceKind("mermaid")).toBe("mermaid");
  expect(fenceKind("PlantUML title x")).toBe("plantuml");
  expect(fenceKind("js")).toBeUndefined();
  expect(fenceKind("constructor")).toBeUndefined();
  expect(diagramKind("a.constructor")).toBeUndefined();
});

test("sized gives an SVG with a viewBox its pixel size", () => {
  expect(sized('<svg width="100%" style="max-width: 80px" viewBox="0 0 80.5 40"><g/></svg>')).toBe(
    '<svg width="81" height="40" style="max-width: 80px" viewBox="0 0 80.5 40"><g/></svg>',
  );
  expect(sized("<svg><g/></svg>")).toBe("<svg><g/></svg>");
});

test("svgSize reads the tag, not a child's size", () => {
  expect(svgSize('<svg style="max-width: 9px" width="81px" height="40.4"><rect width="5" height="5"/></svg>')).toEqual({
    width: 81,
    height: 40,
  });
  expect(svgSize('<svg width="100%"><rect width="5" height="5"/></svg>')).toBeUndefined();
});

test("errorSvg escapes the message", () => {
  expect(errorSvg("a <b> & c")).toContain("a &lt;b> &amp; c");
});
