import { expect, test } from "./test";
import { e2eWorkspace } from "../playwright.config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// M50: every :w keeps the text it replaced; <Space>fh diffs the buffer against one of them.
test("local history: two saves, pick the older one, see its lines", async ({ page }) => {
  writeFileSync(join(e2eWorkspace, "history.txt"), "first\n");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "history.txt" }).click();
  const editor = page.locator(".cm-content");
  await expect(editor).toContainText("first");
  await page.keyboard.press("Space");
  await page.keyboard.type("fh");
  await expect(page.locator(".statusline")).toContainText('No earlier saves of "history.txt" yet');

  // Each save is awaited by the tab losing its dirty dot; the picker opened early lists only the saves finished so far.
  const dirty = page.locator(".tab.active .dirty");
  const save = async (text: string) => {
    await page.keyboard.type(`cc${text}`);
    await page.keyboard.press("Escape");
    await expect(dirty).toHaveCount(1);
    await page.keyboard.type(":w");
    await page.keyboard.press("Enter");
    await expect(dirty).toHaveCount(0);
  };
  await save("second");
  await save("third");

  await page.keyboard.press("Space");
  await page.keyboard.type("fh");
  const picker = page.getByRole("dialog", { name: "History of history.txt" });
  await expect(picker.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("ArrowDown"); // the older one: "first"
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-deletedChunk")).toContainText("first");
  await page.keyboard.press("Space");
  await page.keyboard.type("gd");
  await expect(page.locator(".cm-deletedChunk")).toHaveCount(0);
});
