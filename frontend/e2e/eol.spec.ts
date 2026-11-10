import { expect, test } from "@playwright/test";
import { e2eWorkspace } from "../playwright.config";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The fixtures live in a folder (one tree row) and are removed again: the tree is virtualized, so extra rows in the
// shared workspace root would push other specs' files out of view.
const dir = join(e2eWorkspace, "eolspec");
test.beforeEach(() => mkdirSync(dir, { recursive: true }));
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(e2eWorkspace, ".editorconfig"), { force: true });
});

// A CRLF file keeps its line endings on save (the doc holds LF), and a file that is no UTF-8 text is not opened.
test("CRLF survives :w, binary is refused", async ({ page }) => {
  const crlf = join(dir, "crlf.txt");
  writeFileSync(crlf, "one\r\ntwo\r\n");
  writeFileSync(join(dir, "blob.dat"), Buffer.from([0x61, 0, 0xe4, 0x62]));
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "README.md" }).click(); 
  await expect(page.locator(".statusline")).toContainText("README.md");
  await page.keyboard.type(":e eolspec/crlf.txt");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline")).toContainText("CRLF");
  await page.locator(".cm-content").click();
  await page.keyboard.type("Ax");
  await page.keyboard.press("Escape");
  await page.keyboard.type(":w");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline")).toContainText("written");
  const saved = readFileSync(crlf, "utf8");
  expect(saved).toContain("x");
  expect(saved.replace(/\r\n/g, "")).not.toMatch(/\n/); // no bare LF left

  await page.keyboard.type(":e eolspec/blob.dat");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline")).toContainText("not a text file");
});

// .editorconfig in the folder root sets the indent: a Tab key in a *.txt file gives 3 spaces.
test(".editorconfig sets the indent", async ({ page }) => {
  writeFileSync(join(e2eWorkspace, ".editorconfig"), "[*.txt]\nindent_style = space\nindent_size = 3\n");
  writeFileSync(join(dir, "ec.txt"), "x\n");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "README.md" }).click();
  await expect(page.locator(".statusline")).toContainText("README.md");
  await page.keyboard.type(":e eolspec/ec.txt");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline")).toContainText("eolspec/ec.txt");
  await page.keyboard.type("i");
  await page.keyboard.press("Control+t"); // vim insert mode: indent the line by one level
  await expect(page.locator(".cm-line").first()).toHaveText("   x");
});
