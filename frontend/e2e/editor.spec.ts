import { expect, test } from "./test";
import { e2eWorkspace } from "../playwright.config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const readme = join(e2eWorkspace, "README.md");

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
  await expect(page.locator(".titlebar")).toContainText("README.md");

  await page.keyboard.type("Onew line");
  await page.keyboard.press("Escape");
  await expect(page.locator(".titlebar .dirty")).toBeVisible();
  await page.keyboard.type(":w");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline")).toContainText('"README.md" written');
  expect(readFileSync(readme, "utf8")).toMatch(/^new line\n# E2E workspace/);

  await page.keyboard.type("x"); // dirty, so the watcher must not reload over it
  await expect(page.locator(".titlebar .dirty")).toBeVisible();
  writeFileSync(readme, "theirs\n");
  await expect(page.locator(".statusline .msg.error")).toContainText("changed on disk");
  await page.keyboard.type(":w");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline .msg.error")).toContainText("changed on disk");
  expect(readFileSync(readme, "utf8")).toBe("theirs\n");
});

// M3: a file made outside shows up in the tree; a clean buffer follows disk, the cursor stays on its line.
test("external changes reach tree and clean buffers", async ({ page }) => {
  const file = join(e2eWorkspace, "watched.txt");
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
  await expect(page.locator(".titlebar .dirty")).toHaveCount(0);
});

// M22: :w trims line ends and extra blank lines at the end; u brings them back (unsaved).
test(":w cleans up, u undoes it", async ({ page }) => {
  const file = join(e2eWorkspace, "cleanup.txt");
  writeFileSync(file, "a  \nb\t\n\n\n");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "cleanup.txt" }).click();
  await expect(page.locator(".cm-content")).toContainText("b");
  await page.keyboard.type(":w\n");
  await expect(page.locator(".statusline")).toContainText('"cleanup.txt" written');
  expect(readFileSync(file, "utf8")).toBe("a\nb\n");
  await page.keyboard.type("u");
  await expect(page.locator(".titlebar .dirty")).toBeVisible();
  await expect(page.locator(".statusline")).toContainText("1:");
  expect(await page.locator(".cm-line").first().textContent()).toBe("a  ");
});

// M41: two panes on one file share undo, like nvim's one undo tree per buffer.
test("u undoes the latest edit of the file, whichever pane made it", async ({ page }) => {
  writeFileSync(join(e2eWorkspace, "undo.txt"), "one\n");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "undo.txt" }).click();
  const panes = page.locator("[data-pane] .cm-content");
  await expect(panes.first()).toContainText("one");
  await page.keyboard.type("Aleft");
  await page.keyboard.press("Escape");
  await page.keyboard.type(":vsplit");
  await page.keyboard.press("Enter");
  await expect(panes).toHaveCount(2);
  await page.keyboard.type("Aright");
  await page.keyboard.press("Escape");
  await expect(panes.nth(0)).toContainText("oneleftright");
  await page.keyboard.press("Control+h"); // back to the first pane, whose own last edit is "left"
  await page.keyboard.type("u");
  await expect(panes.nth(0)).toContainText("oneleft");
  await expect(panes.nth(0)).not.toContainText("right");
  await expect(panes.nth(1)).not.toContainText("right");
  await page.keyboard.type("u");
  await expect(panes.nth(1)).not.toContainText("left");
  await page.keyboard.press("Control+r");
  await page.keyboard.press("Control+r");
  await expect(panes.nth(0)).toContainText("oneleftright");
});

// M63: global marks (mA) are per editor in codemirror-vim, so 'A in another file finds nothing. A known gap: when it
// is built this test turns red and moves to the passing ones.
test.fail("mA in one file, 'A from another jumps back", async ({ page }) => {
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  await tree.getByRole("treeitem", { name: "README.md" }).click();
  await expect(page.locator(".cm-content")).toContainText("E2E workspace");
  await page.keyboard.type("jmA");
  await page.keyboard.type(":e notes.md");
  await page.keyboard.press("Enter");
  await expect(page.locator(".titlebar")).toContainText("notes.md");
  await page.keyboard.type("'A");
  await expect(page.locator(".titlebar")).toContainText("README.md", { timeout: 2000 });
});

test("Cmd+W closes the tab and shows the next one", async ({ page }) => {
  test.skip(process.platform !== "darwin", "Cmd is the Mac key");
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  await tree.getByRole("treeitem", { name: "README.md" }).click();
  await tree.getByRole("treeitem", { name: "notes.md" }).click();
  const tabs = page.locator(".tabbar .tab");
  await expect(tabs).toHaveCount(2);
  await page.keyboard.press("Meta+w");
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toContainText("README.md");
});
