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
  await expect(page.locator(".statusline .dirty")).toBeVisible();
  await page.keyboard.type(":w");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline")).toContainText('"README.md" written');
  expect(readFileSync(readme, "utf8")).toMatch(/^new line\n# E2E workspace/);

  await page.keyboard.type("x"); // dirty, so the watcher must not reload over it
  await expect(page.locator(".statusline .dirty")).toBeVisible();
  writeFileSync(readme, "theirs\n");
  await expect(page.locator(".statusline .msg.error")).toContainText("changed on disk");
  await page.keyboard.type(":w");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline .msg.error")).toContainText("changed on disk");
  expect(readFileSync(readme, "utf8")).toBe("theirs\n");
});

// M3: a file made outside shows up in the tree; a clean buffer follows disk, the cursor stays on its line.
test("external changes reach tree and clean buffers", async ({ page }) => {
  const file = join(tmpdir(), "ayaz-e2e-ws", "watched.txt");
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree.getByRole("treeitem", { name: "README.md" })).toBeVisible();

  writeFileSync(file, "one\ntwo\nthree\n");
  await expect(tree.getByRole("treeitem", { name: "watched.txt" })).toBeVisible();
  await tree.getByRole("treeitem", { name: "watched.txt" }).click();
  await expect(page.locator(".cm-content")).toContainText("three");
  await page.keyboard.type("jj"); // cursor on "three"
  await expect(page.locator(".statusline")).toContainText("3:1");

  writeFileSync(file, "zero\none\ntwo\nthree\n");
  await expect(page.locator(".cm-content")).toContainText("zero");
  await expect(page.locator(".statusline")).toContainText("4:1");
  await expect(page.locator(".statusline .dirty")).toHaveCount(0);
});
