import { expect, test, vi } from "vitest";
import { previewSkin, renderMarkdown, setSkin, skin } from "./mdrender";

const html = (md: string, ctx: { ws: string; file: string } | null = null) => {
  const d = document.createElement("div");
  d.append(renderMarkdown(md, ctx).content);
  return d;
};

test("raw HTML shows, scripts and inline styles do not", () => {
  const d = html(
    '<p align="center"><a href="https://x.y"><img src="https://a.b/c.svg" alt="B"></a></p>\n\n<script>alert(1)</script><b style="color:red">x</b>',
  );
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

test("headings carry unique ids and their place for the outline", () => {
  const d = html("# Features\n\n## Features\n\n## API?\n\n## API");
  expect([...d.querySelectorAll("h1, h2")].map((h) => h.id)).toEqual(["features", "features-1", "api", "api-1"]);
  expect([...d.querySelectorAll("[data-md-heading]")].map((h) => h.getAttribute("data-md-heading"))).toEqual([
    "0",
    "1",
    "2",
    "3",
  ]);
});

test("a picked skin is kept until settings.json names another one", () => {
  localStorage.removeItem("ayaz.mdskin");
  expect(skin()).toBe("github"); // the default
  setSkin("document");
  expect(skin()).toBe("document");
  localStorage.setItem("ayaz.mdskin", JSON.stringify({ pick: "document", file: "kairo" })); // picked over another file value
  expect(skin()).toBe("github");
  localStorage.setItem("ayaz.mdskin", "{broken");
  expect(skin()).toBe("github");
  localStorage.removeItem("ayaz.mdskin");
});

test("a previewed skin shows but is never stored", () => {
  localStorage.removeItem("ayaz.mdskin");
  previewSkin("compact");
  expect(skin()).toBe("compact"); // the open reading views show it
  expect(localStorage.getItem("ayaz.mdskin")).toBeNull();
  previewSkin(null); // leaving the picker without a pick
  expect(skin()).toBe("github");
  expect(localStorage.getItem("ayaz.mdskin")).toBeNull();
});

test("a picked skin lasts the session when storage is blocked", () => {
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  localStorage.removeItem("ayaz.mdskin");
  setSkin("compact");
  expect(skin()).toBe("compact"); // no redraw falls back to the settings value
  set.mockRestore();
  setSkin("github"); // back to the default and clear the session for the tests after this one
  localStorage.removeItem("ayaz.mdskin");
});
