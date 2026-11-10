import { expect, test } from "@playwright/test";
import { e2eWorkspace } from "../playwright.config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// M16: splits, files and cursors come back when the folder opens again (here: a reload).
test("session: splits, files, active pane and cursor survive a reload", async ({ page }) => {
  writeFileSync(join(e2eWorkspace, "session.txt"), "red gray\ngray blue\n"); // own file and words: tests run in parallel, search.spec greps
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  const status = page.locator(".statusline");
  await tree.getByRole("treeitem", { name: "session.txt" }).click();
  await expect(page.locator(".cm-content")).toContainText("red gray");
  await page.keyboard.type("jw"); // line 2, second word
  await expect(status).toContainText("2:6");
  await page.keyboard.type(":vsplit");
  await page.keyboard.press("Enter");
  await page.keyboard.type(":e README.md");
  await page.keyboard.press("Enter");
  await expect(status).toContainText("README.md");
  await page.waitForTimeout(800); // the session saves 500 ms after the last change

  await page.reload();
  await expect(page.locator("[data-pane]")).toHaveCount(2);
  await expect(status).toContainText("README.md");
  await page.keyboard.press("Control+h");
  await expect(status).toContainText("session.txt");
  await expect(status).toContainText("2:6");
});
