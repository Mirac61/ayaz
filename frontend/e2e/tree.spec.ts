import { expect, test } from "./test";
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
  await expect(page.locator(".titlebar")).toContainText("src/notes/todo.txt");
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
  await expect(page.locator(".titlebar")).toContainText("src/done.txt");
  await expect(page.locator(".cm-content")).toContainText("hello");
  expect(readFileSync(join(ws, "src", "done.txt"), "utf8")).toBe("hello\n"); // :w adds the final newline (M22)
  expect(existsSync(join(ws, "src", "notes", "todo.txt"))).toBe(false);
  await expect(tree).toBeFocused();

  await page.keyboard.press("d");
  await expect(page.getByRole("dialog")).toContainText('Move "src/done.txt" to the trash?');
  await page.keyboard.press("Escape");
  expect(existsSync(join(ws, "src", "done.txt"))).toBe(true);
});

// M27: the tree's Nerd Font glyphs come from the bundled symbols font when none is installed.
test("bundled symbols font is loaded", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tree", { name: "Files" })).toBeVisible();
  expect(await page.evaluate(() => document.fonts.check('13px "Ayaz Symbols"', ""))).toBe(true);
});

// M31: "/" filters the tree over the whole project, Enter goes to the rows, Esc ends the filter.
test("tree filter", async ({ page }) => {
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  await page.keyboard.press("/");
  const box = page.getByRole("textbox", { name: "Filter files" });
  await expect(box).toBeFocused();
  await page.keyboard.type("greetgo"); // fuzzy: "greet" alone matches git.spec's gittree.txt too
  await expect(tree.getByRole("treeitem")).toHaveText([/src/, /greet\.go/]); // src/ wasn't open: found anyway
  await page.keyboard.press("Enter");
  await expect(tree).toBeFocused();
  await expect(tree.getByRole("treeitem", { name: "greet.go" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(box).toBeHidden();
  await expect(tree.getByRole("treeitem", { name: "README.md" })).toBeVisible();
  await page.keyboard.press("/");
  await page.keyboard.type("greetgo");
  await expect(tree.getByRole("treeitem", { name: "greet.go" })).toBeVisible(); // results come async
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // opens the file
  await expect(page.locator(".titlebar")).toContainText("src/greet.go");

  // M35: Enter typed before the results arrive waits for them, then lands on the first file
  // (not on the row where the previous query's first file was).
  await tree.focus();
  await page.keyboard.press("/");
  await page.keyboard.type("hellc");
  await expect(tree.getByRole("treeitem")).toHaveText([/hello\.c/]);
  await page.keyboard.press("Enter");
  await page.keyboard.press("/"); // the old text, selected
  await page.keyboard.type("greetgo", { delay: 0 });
  await page.keyboard.press("Enter");
  await expect(tree.getByRole("treeitem", { name: "greet.go" })).toHaveAttribute("aria-selected", "true");
});
