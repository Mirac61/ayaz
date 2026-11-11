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
  await expect(page.locator(".statusline")).toContainText("terminal");
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
  await expect(page.locator(".statusline")).toContainText("terminal");
  expect(Math.abs((await box(panel)).height - after)).toBeLessThan(2);
});

// Cmd+B hides the file tree and the editor takes its width; <Space>e brings it back focused; the choice survives a reload.
test("hide and show the file tree", async ({ page }) => {
  const toggle = process.platform === "darwin" ? "Meta+b" : "Control+Shift+b";
  await page.goto("/?renderer=dom");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  const wide = (await box(page.locator(".panes"))).width;
  await page.keyboard.press(toggle);
  await expect(tree).toBeHidden();
  await expect.poll(async () => (await box(page.locator(".panes"))).width).toBeGreaterThan(wide + 200);
  await page.reload();
  await expect(page.locator(".panes")).toBeVisible();
  await expect(tree).toBeHidden();
  await page.keyboard.type(" e");
  await expect(tree).toBeFocused();
  await page.reload();
  await expect(tree).toBeVisible();
});

// Chromium 158+ returns a Promise from scrollIntoView; the palette's effect handed it to React as a cleanup and the
// whole UI unmounted when a pick closed the palette and split at once.
test("palette: picking a split keeps the UI alive", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "README.md" }).click();
  await expect(page.locator(".titlebar")).toContainText("README.md");
  await page.locator(".cm-content").click();
  await page.keyboard.type(":vsplit");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-pane]")).toHaveCount(2);
});

// No file open: the keys to start with show over the empty buffer and go with the first typed character.
test("empty window shows the first keys", async ({ page }) => {
  await page.goto("/?renderer=dom");
  const hints = page.locator(".pane-empty");
  await expect(hints).toContainText("Command palette");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "README.md" }).click();
  await expect(page.locator(".titlebar")).toContainText("README.md");
  await expect(hints).toHaveCount(0);
});

test("terminal panel docks right and top, a split pane closes with its x", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.keyboard.press("Control+l");
  await page.keyboard.press("Control+w");
  await page.keyboard.press("v");
  const panes = page.locator(".panes > .pane");
  await expect(panes).toHaveCount(2);
    await page.waitForTimeout(300); // the editor's own tab bar logic must leave the ghost alone
  await expect(panes.last().locator(".ghost")).toBeVisible();
  await panes.last().locator(".ghost .tab-close").click();
  await expect(panes).toHaveCount(1);

  await page.keyboard.type(" t");
  const panel = page.locator(".panel");
  await expect(panel).toBeVisible();
  const dock = panel.getByRole("button", { name: "Move terminal panel" });
  await dock.click();
  await expect.poll(async () => (await box(panel)).x).toBeGreaterThan((await box(page.locator(".panes"))).x);
  await dock.click();
  await expect.poll(async () => (await box(panel)).y).toBeLessThan((await box(page.locator(".panes"))).y);
});
