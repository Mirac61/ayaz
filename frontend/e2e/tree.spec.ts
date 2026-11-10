import { expect, test } from "@playwright/test";
import { e2eWorkspace } from "../playwright.config";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ws = e2eWorkspace;

// M15: a/r/d in the tree. The trash itself is left out: it would land in the real ~/.Trash.
test("tree: new file, rename with the open buffer, trash prompt cancels", async ({ page }) => {
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  const picker = page.getByRole("combobox", { name: "Search" });
  await expect(tree.getByRole("treeitem", { name: "README.md" })).toBeVisible();
  await expect(tree).toBeFocused();

  await page.keyboard.press("a"); // cursor on src/: the new file goes in there
  await expect(picker).toHaveValue("src/");
  await page.keyboard.type("notes/todo.txt");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline")).toContainText("src/notes/todo.txt");
  expect(existsSync(join(ws, "src", "notes", "todo.txt"))).toBe(true);
  await expect(tree.getByRole("treeitem", { name: "todo.txt" })).toHaveAttribute("aria-selected", "true");

  await page.locator(".cm-content").click();
  await page.keyboard.type("ihello");
  await page.keyboard.press("Escape");
  await page.keyboard.type(":w");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline")).toContainText("written");

  await page.keyboard.press("Control+h"); // back to the tree
  await expect(tree).toBeFocused();
  await page.keyboard.press("r");
  await expect(picker).toHaveValue("src/notes/todo.txt");
  await picker.fill("src/done.txt");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline")).toContainText("src/done.txt");
  await expect(page.locator(".cm-content")).toContainText("hello");
  expect(readFileSync(join(ws, "src", "done.txt"), "utf8")).toBe("hello");
  expect(existsSync(join(ws, "src", "notes", "todo.txt"))).toBe(false);
  await expect(tree).toBeFocused();

  await page.keyboard.press("d");
  await expect(page.getByRole("dialog")).toContainText('Move "src/done.txt" to the trash?');
  await page.keyboard.press("Escape");
  expect(existsSync(join(ws, "src", "done.txt"))).toBe(true);
});
