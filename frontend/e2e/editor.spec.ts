import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const readme = join(tmpdir(), "ayaz-e2e-ws", "README.md"); // copied by playwright.config.ts

// Tree → open → vim edit → :w lands on disk; an external change then blocks the next :w.
test("open, edit, save, and conflict on external change", async ({ page }) => {
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree.getByRole("treeitem", { name: "README.md" })).toBeVisible();
  await expect(tree).toBeFocused();

  await page.keyboard.press("j"); // src/ → README.md
  await page.keyboard.press("Enter");
  const content = page.locator(".cm-content");
  await expect(content).toContainText("# E2E workspace");
  await expect(page.locator(".statusline")).toContainText("README.md");

  await page.keyboard.type("Onew line");
  await page.keyboard.press("Escape");
  await expect(page.locator(".statusline")).toContainText("[+]");
  await page.keyboard.type(":w");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline")).toContainText('"README.md" written');
  expect(readFileSync(readme, "utf8")).toMatch(/^new line\n# E2E workspace/);

  writeFileSync(readme, "theirs\n");
  await page.keyboard.type("x:w");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline .msg.error")).toContainText("changed on disk");
  expect(readFileSync(readme, "utf8")).toBe("theirs\n");
});
