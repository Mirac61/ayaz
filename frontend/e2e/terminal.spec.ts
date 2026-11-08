import { expect, test } from "@playwright/test";
import { homedir } from "node:os";

// The whole path: page → stream → Go → PTY shell → stream → xterm.
test("terminal runs a command and shows its output", async ({ page }) => {
  await page.goto("/?view=term&renderer=dom");
  const term = page.locator(".xterm");
  await expect(term).toBeVisible();
  await term.click();
  await page.keyboard.type("echo $PWD\n");
  await expect(page.locator(".xterm-rows")).toContainText(homedir(), { timeout: 10_000 });
});
