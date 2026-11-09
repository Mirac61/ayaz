import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { e2eWorkspace } from "../playwright.config";

// M8 done-when: search across the project, walk the quickfix list, replace with preview, all by keyboard.
test("search, quickfix, replace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.keyboard.type(" fw");
  const picker = page.getByRole("dialog", { name: /Search in files/ });
  await expect(picker).toBeVisible();
  await page.keyboard.type("beta");
  await expect(picker.getByRole("option")).toHaveCount(2);
  await expect(picker.getByRole("option").first()).toContainText("search.txt:");

  await page.keyboard.press("Control+q");
  await expect(picker).toBeHidden();
  const status = page.locator(".statusline");
  await expect(status).toContainText("(1 of 2) alpha beta");
  await page.keyboard.type("]q");
  await expect(status).toContainText("(2 of 2) beta gamma");
  await expect(status).toContainText("2:1");
  await page.keyboard.type("]q");
  await expect(status).toContainText("No more items");

  await page.keyboard.type(":Replace delta");
  await page.keyboard.press("Enter");
  const preview = page.getByRole("dialog", { name: /Replace 2 matches in 1 files/ });
  await expect(preview.getByRole("option").first()).toContainText("search.txt:1: alpha delta");
  await page.keyboard.press("Enter");
  await expect(status).toContainText("Replaced 2 in 1 files");
  await expect(page.locator(".cm-content")).toContainText("delta gamma");
  await expect.poll(() => readFileSync(join(e2eWorkspace, "search.txt"), "utf8")).toBe("alpha delta\ndelta gamma\n");
});
