import { expect, test, type Locator } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { e2eWorkspace } from "../playwright.config";

// M12 done-when: the preview follows the buffer, runs no HTML from the file, and tabs toggle without a restart.
test("markdown preview in a split", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "notes.md" }).click();
  const editor = page.locator(".pane .cm-editor");
  await expect(editor).toHaveCount(1);
  await page.locator(".cm-content").click();
  await page.keyboard.type(" mp");
  await expect(editor).toHaveCount(2);
  const preview = page.locator(".cm-editor.cm-reading");
  await expect(preview).toHaveCount(1);
  await expect(page.locator(".statusline")).toContainText("normal"); // typing goes to the source

  await page.keyboard.type('Go<b id="inj">raw</b> and live text');
  await page.keyboard.press("Escape");
  await expect(preview).toContainText("live text");
  await expect(page.locator("#inj")).toHaveCount(0); // shown as text, never as HTML

  await page.keyboard.type(" mp");
  await expect(editor).toHaveCount(1);
  await expect(page.locator(".cm-reading")).toHaveCount(0);
});

// Source and preview keep the same line at the top; the active pane leads. Scrolled like a mouse wheel.
test("markdown preview scrolls with the source and back", async ({ page }) => {
  writeFileSync(join(e2eWorkspace, "long.md"), Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join("\n") + "\n");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "long.md" }).click();
  const status = page.locator(".statusline");
  await expect(page.locator(".titlebar")).toContainText("long.md");
  const source = page.locator(".cm-editor:not(.cm-reading)"), preview = page.locator(".cm-editor.cm-reading");
  const scroll = (ed: Locator, y: number) => ed.locator(".cm-scroller").evaluate((e, y) => { e.scrollTop = y; }, y);
  const top = (ed: Locator) => ed.evaluate((e) => {
    const y = e.querySelector(".cm-scroller")!.getBoundingClientRect().top;
    return [...e.querySelectorAll(".cm-line")].find((l) => l.getBoundingClientRect().bottom > y + 1)?.textContent;
  });
  const both = async () => { const [s, p] = [await top(source), await top(preview)]; return s === p ? s : `${s} | ${p}`; };

  await scroll(source, 3000);
  await page.keyboard.type(" mp"); // the preview opens where the source is
  await expect(preview).toHaveCount(1);
  await expect.poll(both).toMatch(/^line 1\d\d$/);

  await page.keyboard.press("Control+w");
  await page.keyboard.type("l");
  await expect(status).toContainText("read"); // the preview leads now
  await scroll(preview, 0);
  await expect.poll(both).toBe("line 1");

  await page.keyboard.press("Control+w");
  await page.keyboard.type("h");
  await expect(status).toContainText("normal");
  await scroll(source, 5000);
  await expect.poll(both).toMatch(/^line 2\d\d$/);
});

test("tab bar: toggle, gt, close", async ({ page }) => {
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  const palette = async (cmd: string) => {
    await page.keyboard.type(" fk");
    await expect(page.getByRole("dialog", { name: "Commands" })).toBeVisible();
    await page.keyboard.type(cmd);
    await expect(page.getByRole("option", { selected: true })).toHaveText(new RegExp(cmd));
    await page.keyboard.press("Enter");
  };
  await palette("Toggle tab bar");
  await tree.getByRole("treeitem", { name: "hello.go" }).click();
  await tree.getByRole("treeitem", { name: "search.txt" }).click();
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveText(["hello.go", "search.txt"]);
  await expect(page.getByRole("tab", { selected: true })).toHaveText("search.txt");

  await page.locator(".cm-content").click();
  await page.keyboard.type("ggx"); // an unsaved change marks the tab, undoing it clears the mark
  await expect(page.locator(".titlebar .dirty")).toBeVisible();
  await expect(page.getByRole("tab", { selected: true }).locator(".dirty")).toBeVisible();
  await page.keyboard.type("u");
  await expect(page.getByRole("tab", { selected: true })).toHaveText("search.txt");
  await page.keyboard.type("gt");
  await expect(page.getByRole("tab", { selected: true })).toHaveText("hello.go");
  await page.keyboard.type(" bd");
  await expect(tabs).toHaveText(["search.txt"]);
  await expect(page.locator(".titlebar")).toContainText("search.txt");

  await palette("Toggle tab bar");
  await expect(page.locator(".tabbar")).toHaveCount(0);
  await palette("Toggle tab bar"); // back on: the pane still knows its tabs
  await expect(tabs).toHaveText(["search.txt"]);
  await palette("Toggle tab bar"); // leave it off for the other tests' storage
});
