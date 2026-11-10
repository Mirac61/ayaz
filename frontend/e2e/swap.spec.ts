import { expect, test } from "@playwright/test";
import { e2eWorkspace } from "../playwright.config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// M49: unsaved text survives a reload (crash, killed app) and is offered back per file.
test("hot exit: typed text comes back after a reload, or is discarded", async ({ page }) => {
  writeFileSync(join(e2eWorkspace, "swap-a.txt"), "alpha\n");
  writeFileSync(join(e2eWorkspace, "swap-b.txt"), "beta\n");
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  const editor = page.locator(".cm-content");
  await tree.getByRole("treeitem", { name: "swap-a.txt" }).click();
  await expect(editor).toContainText("alpha");
  await page.keyboard.type("Okept ");
  await page.keyboard.press("Escape");
  await page.keyboard.type(":e swap-b.txt");
  await page.keyboard.press("Enter");
  await expect(editor).toContainText("beta");
  await page.keyboard.type("Odropped ");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500); // swaps are written every 2 s

  await page.reload();
  const picker = page.locator(".picker");
  await expect(picker).toContainText("has unsaved changes from last time");
  // One file at a time, in no fixed order: restore swap-a, discard swap-b.
  for (let i = 0; i < 2; i++) {
    const a = (await picker.textContent())!.includes("swap-a.txt");
    if (!a) await page.keyboard.press("ArrowDown"); // Discard
    await page.keyboard.press("Enter");
    if (i === 0) await expect(picker).toContainText(a ? "swap-b.txt" : "swap-a.txt");
  }
  await expect(picker).toHaveCount(0);
  await page.keyboard.type(":e swap-a.txt");
  await page.keyboard.press("Enter");
  await expect(editor).toContainText("kept alpha");
  await expect(page.getByTitle("Modified").first()).toBeVisible();
  expect(readFileSync(join(e2eWorkspace, "swap-a.txt"), "utf8")).toBe("alpha\n"); // restored as unsaved, not written

  // :w drops the swap, so the next reload asks nothing.
  await page.keyboard.type(":w");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(page.getByRole("tree", { name: "Files" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(picker).toHaveCount(0);
});
