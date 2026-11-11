import { expect, test } from "@playwright/test";

// The file tree closes by dragging its edge shut, and Cmd/Ctrl+B brings it back; no lazygit row sits above the files.
test("sidebar: drag shut, toggle back, no lazygit row", async ({ page }) => {
  await page.goto("/?renderer=dom");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  await expect(page.locator(".sidebar-entry")).toHaveCount(0);
  const side = page.locator(".sidebar");
  const box = (await side.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width + 1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, y, { steps: 6 });
  await page.mouse.up();
  await expect(side).toBeHidden();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+b" : "Control+Shift+b");
  await expect(side).toBeVisible();
});
