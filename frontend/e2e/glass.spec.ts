import { expect, test } from "@playwright/test";

// Toggle transparency works live: the surfaces turn see-through and solid again, no new window needed.
test("transparency toggles live", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  const alpha = () => page.locator(".sidebar").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await alpha()).not.toContain("/ 0.");
  await page.keyboard.type(" fk"); // <Space>fk: the command palette
  await page.keyboard.type("Toggle transparency");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-glass", /.*/);
  await expect.poll(alpha).toMatch(/0\.\d+\)?$/);
});

// The reading view sits over the editor; with glass on its background is see-through, so the source text must be hidden.
test("reading view hides the source under glass", async ({ page }) => {
  await page.goto("/?renderer=dom");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  await tree.getByRole("treeitem", { name: "notes.md" }).click();
  await page.keyboard.type(" fk");
  await page.keyboard.type("Toggle transparency");
  await page.keyboard.press("Enter");
  await page.keyboard.type(" mr"); // <Space>mr: reading view
  await expect(page.locator(".md-render")).toBeVisible();
  await expect(page.locator(".cm-scroller")).toHaveCSS("opacity", "0");
});
