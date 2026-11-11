import { expect, test } from "vitest";
import { renderMarkdown } from "./mdrender";

const html = (md: string, ctx: { ws: string; file: string } | null = null) => {
  const d = document.createElement("div");
  d.append(renderMarkdown(md, ctx).content);
  return d;
};

test("raw HTML shows, scripts and inline styles do not", () => {
  const d = html('<p align="center"><a href="https://x.y"><img src="https://a.b/c.svg" alt="B"></a></p>\n\n<script>alert(1)</script><b style="color:red">x</b>');
  expect(d.querySelector("p[align=center] a img")).not.toBeNull();
  expect(d.querySelector("script")).toBeNull();
  expect(d.querySelector("[style]")).toBeNull();
});

test("relative images point into the workspace, URLs stay", () => {
  const d = html("![a](img/x.png) ![b](https://h/i.png)", { ws: "w", file: "docs/README.md" });
  const [a, b] = [...d.querySelectorAll("img")].map((i) => i.getAttribute("src"));
  expect(a).toBe("/fs/w/docs/img/x.png");
  expect(b).toBe("https://h/i.png");
});

test("task lists, tables and heading ids", () => {
  const d = html("# Hello World\n\n- [x] done\n- [ ] open\n\n|a|b|\n|-|-|\n|1|2|");
  expect(d.querySelector("h1")?.id).toBe("hello-world");
  expect([...d.querySelectorAll("li.task input")].map((i) => (i as HTMLInputElement).checked)).toEqual([true, false]);
  expect(d.querySelectorAll("table td").length).toBe(2);
});
