import { expect, test } from "./test";

// The docs open like Vim's :help: a read-only Markdown tab, rendered, not a modal.
test("F1 opens the docs as a tab, links open topics", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused(); // the app is ready for keys
  await page.keyboard.press("F1");
  await expect(page.locator(".tab.active")).toHaveAttribute("title", "docs://index.md");
  const render = page.locator(".md-render");
  await expect(render).toContainText("Ayaz docs");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.type("ddx"); // read-only: nothing changes
  await expect(page.locator(".tab.active .dirty")).toHaveCount(0);

  await render.getByRole("link", { name: /Git Remote Suite/ }).click();
  await expect(page.locator(".tab.active")).toHaveAttribute("title", "docs://git-suite.md");
  await expect(render).toContainText("Git Remote Suite in Ayaz");
});

// The start page's ? opens a workbench on the docs folder with the index, and the folder stays out of Recent.
test("start page ? opens the docs tab", async ({ page }) => {
  await page.goto("/?new&renderer=dom");
  await expect(page.locator(".welcome")).toBeFocused(); // ready for single keys
  await page.keyboard.press("?");
  await expect(page.locator(".tab.active")).toHaveAttribute("title", "docs://index.md");
  await expect(page.getByRole("treeitem", { name: "index.md" })).toBeVisible();
  const recent = await page.evaluate(() => localStorage.getItem("ayaz.folders") ?? "");
  expect(recent).not.toContain("/docs");
});
