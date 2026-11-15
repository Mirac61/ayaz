import { expect, test } from "vitest";
import type { Files } from "../core/backend";
import { colorLines, previewFile } from "./preview";

const lines = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`);
const files = {
  preview: async (_path: string, max: number) => (max < 100_000 ? { text: "head", more: true } : { text: lines.join("\n"), more: false }),
  readText: async (path: string) => ({ path, content: lines.join("\n"), mtime: 1 }),
} as unknown as Files;

test("without a line, the head of the file", async () => {
  expect(await previewFile(files, "a.txt")).toEqual({ title: "a.txt", text: "head", first: 1, more: true, spans: null });
});

test("with a line, a window around it", async () => {
  const p = (await previewFile(files, "a.txt", 100))!;
  expect(p.first).toBe(70);
  expect(p.text.split("\n")[p.line! - p.first]).toBe("line 100");
  expect(p.more).toBe(true);
});

test("a hit near the start or the end keeps the window inside the file", async () => {
  expect((await previewFile(files, "a.txt", 2))!.first).toBe(1);
  const end = (await previewFile(files, "a.txt", 299))!;
  expect(end.more).toBe(false);
  expect(end.text.endsWith("line 300")).toBe(true);
});

test("colored lines keep every character and split at newlines", async () => {
  const text = "// a\nconst x = 1;\n\nlet y";
  const spans = (await colorLines("f.js", text))!;
  expect(spans.map((l) => l.map(([t]) => t).join(""))).toEqual(text.split("\n"));
  expect(spans[1].length).toBeGreaterThan(1); // keyword, name, number: not one run
  expect(await colorLines("f.txt", text)).toBeNull();
});

test("a hit past the end of what was read has no preview; library files are read whole", async () => {
  expect(await previewFile(files, "a.txt", 5000)).toBeNull();
  expect((await previewFile(files, "/usr/lib/go/fmt/print.go", 10))!.first).toBe(1);
});
