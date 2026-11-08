import { expect, test, type Locator, type Page } from "@playwright/test";

const box = async (l: Locator) => (await l.boundingBox())!;

async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const b = await box(handle);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 5 });
  await page.mouse.up();
}

// M5: split borders and the panel's top edge drag; <C-w>= evens splits out; the panel keeps its height per folder.
test("drag a split border, <C-w>=, panel height and maximize", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.keyboard.press("Control+l");
  await page.keyboard.press("Control+w");
  await page.keyboard.press("v");
  const panes = page.locator(".panes > .pane");
  await expect(panes).toHaveCount(2);

  const area = await box(page.locator(".panes"));
  await drag(page, page.locator(".panes > .resize.row"), -area.width / 4, 0);
  expect((await box(panes.first())).width / area.width).toBeCloseTo(0.25, 1);

  await page.keyboard.press("Control+w");
  await page.keyboard.press("=");
  await expect.poll(async () => (await box(panes.first())).width / area.width).toBeCloseTo(0.5, 2);

  await page.keyboard.type(" t");
  const panel = page.locator(".panel");
  await expect(page.locator(".statusline")).toContainText("TERMINAL");
  const before = (await box(panel)).height;
  await drag(page, panel.locator("> .resize"), 0, -150);
  const after = (await box(panel)).height;
  expect(after - before).toBeGreaterThan(140);

  // terminal normal mode, then <C-w>z fills the editor area with the panel and back
  await page.keyboard.press("Control+Backslash");
  await page.keyboard.press("Control+n");
  await page.keyboard.press("Control+w");
  await page.keyboard.press("z");
  await expect(page.locator(".panes")).toBeHidden();
  await page.keyboard.press("Control+k"); // leaving the panel restores the editors
  await expect(page.locator(".panes")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.keyboard.type(" t");
  await expect(page.locator(".statusline")).toContainText("TERMINAL");
  expect(Math.abs((await box(panel)).height - after)).toBeLessThan(2);
});
