import { expect, test } from "@playwright/test";

// M12 done-when: the preview follows the buffer, runs no HTML from the file, and tabs toggle without a restart.
test("markdown preview in a split", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "notes.md" }).click();
  const editor = page.locator(".pane .cm-editor");
  await expect(editor).toHaveCount(1);
  await page.locator(".cm-content").click();
  await page.keyboard.type(" mp");
  await expect(editor).toHaveCount(2);
  const preview = page.locator(".cm-editor.cm-reading");
  await expect(preview).toHaveCount(1);
  await expect(page.locator(".statusline")).toContainText("NORMAL"); // typing goes to the source

  await page.keyboard.type('Go<b id="inj">raw</b> and live text');
  await page.keyboard.press("Escape");
  await expect(preview).toContainText("live text");
  await expect(page.locator("#inj")).toHaveCount(0); // shown as text, never as HTML

  await page.keyboard.type(" mp");
  await expect(editor).toHaveCount(1);
  await expect(page.locator(".cm-reading")).toHaveCount(0);
});

test("tab bar: toggle, gt, close", async ({ page }) => {
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  const palette = async (cmd: string) => {
    await page.keyboard.type(" fk");
    await expect(page.getByRole("dialog", { name: "Commands" })).toBeVisible();
    await page.keyboard.type(cmd);
    await expect(page.getByRole("option", { selected: true })).toHaveText(new RegExp(cmd));
    await page.keyboard.press("Enter");
  };
  await palette("Toggle tab bar");
  await tree.getByRole("treeitem", { name: "hello.go" }).click();
  await tree.getByRole("treeitem", { name: "search.txt" }).click();
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveText(["hello.go", "search.txt"]);
  await expect(page.getByRole("tab", { selected: true })).toHaveText("search.txt");

  await page.locator(".cm-content").click();
  await page.keyboard.type("ggx"); // an unsaved change marks the tab, undoing it clears the mark
  await expect(page.locator(".statusline")).toContainText("[+]");
  await expect(page.getByRole("tab", { selected: true })).toHaveText("search.txt [+]");
  await page.keyboard.type("u");
  await expect(page.getByRole("tab", { selected: true })).toHaveText("search.txt");
  await page.keyboard.type("gt");
  await expect(page.getByRole("tab", { selected: true })).toHaveText("hello.go");
  await page.keyboard.type(" bd");
  await expect(tabs).toHaveText(["search.txt"]);
  await expect(page.locator(".statusline")).toContainText("search.txt");

  await palette("Toggle tab bar");
  await expect(page.locator(".tabbar")).toHaveCount(0);
  await palette("Toggle tab bar"); // back on: the pane still knows its tabs
  await expect(tabs).toHaveText(["search.txt"]);
  await palette("Toggle tab bar"); // leave it off for the other tests' storage
});
