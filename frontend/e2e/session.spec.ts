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
  // A split made after the restore keeps the focus (the restore doesn't pull it back to the session's pane).
  await page.keyboard.type(":vsplit");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-pane]")).toHaveCount(3);
  await page.waitForTimeout(100);
  await expect(status).toContainText("session.txt");
});

// M38: a Markdown preview comes back as a preview, a terminal as a new shell in the folder.
test("session: preview and terminal panes come back as what they were", async ({ page }) => {
  writeFileSync(join(e2eWorkspace, "session2.md"), "# Session two\n\nsome *text*\n");
  await page.goto("/?renderer=dom"); // WebGL draws to a canvas, so there'd be no text to assert on
  const tree = page.getByRole("tree", { name: "Files" });
  await tree.getByRole("treeitem", { name: "session2.md" }).click();
  await expect(page.locator(".cm-content")).toContainText("Session two");
  await page.keyboard.press(" ");
  await page.keyboard.type("mp");
  await expect(page.locator("[data-pane]")).toHaveCount(2);
  await page.keyboard.type(":terminal");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-pane]")).toHaveCount(3);
  await expect(page.locator("[data-term]")).toHaveCount(1);
  await page.waitForTimeout(800); // the session saves 500 ms after the last change

  await page.reload();
  await expect(page.locator("[data-pane]")).toHaveCount(3);
  await expect(page.locator("[data-term]")).toHaveCount(1);
  await expect(page.locator("[data-term] .xterm-rows")).toContainText(/\S/); // the shell's prompt
  await expect(page.locator(".cm-reading")).toHaveCount(1);
});
