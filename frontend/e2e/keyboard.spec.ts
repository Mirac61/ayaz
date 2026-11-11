import { expect, test } from "@playwright/test";

// M2 done-when: open a file and split it by keyboard only, and the palette runs commands.
test("find a file, split, close the split, palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();

  await page.keyboard.type(" ff"); // leader works in the tree too
  const picker = page.getByRole("dialog", { name: "Files" });
  await expect(picker).toBeVisible();
  await page.keyboard.type("maingo");
  await expect(picker.getByRole("option", { selected: true })).toHaveText(/src\/main\.go/);
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(page.locator(".titlebar")).toContainText("src/main.go");
  await expect(page.locator(".pane .cm-content")).toContainText("package main");

  await page.keyboard.press("Control+w");
  await page.keyboard.press("v");
  await expect(page.locator(".pane")).toHaveCount(2);
  await expect(page.locator(".pane.edge-left .cm-content")).toContainText("package main");
  await expect(page.locator(".pane.edge-left .cm-content")).toBeFocused();

  // an edit shows up in both panes
  await page.keyboard.type("Ohello");
  await page.keyboard.press("Escape");
  await expect(page.locator(".pane .cm-content").first()).toContainText("hello");

  await page.keyboard.press("Control+h");
  await expect(page.locator(".pane").first().locator(".cm-content")).toBeFocused();
  await page.keyboard.type(":q");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pane")).toHaveCount(1);

  await page.keyboard.press("F1");
  const palette = page.getByRole("dialog", { name: "Commands" });
  await page.keyboard.type("split down");
  await expect(palette.getByRole("option", { selected: true })).toHaveText(/Split pane down/);
  await page.keyboard.press("Enter");
  await expect(page.locator(".pane.edge-top")).toHaveCount(1);
});
