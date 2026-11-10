import { expect, test } from "@playwright/test";
import { e2eConfig } from "../playwright.config";
import { execSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// M34: a saved settings.json or keymap.json applies without a restart; a broken one keeps the last good values.
test("settings.json and keymap.json apply when saved", async ({ page }) => {
  test.setTimeout(20_000);
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "search.txt" }).click();
  const content = page.locator(".cm-content");
  await expect(content).toBeVisible();
  const tabSize = () => content.evaluate((el) => getComputedStyle(el).tabSize);
  expect(await tabSize()).toBe("4");

  // .txt only, so the tests running next to this one keep their settings.
  writeFileSync(join(e2eConfig, "settings.json"), JSON.stringify({ languages: { txt: { tabWidth: 3 } } }));
  await expect.poll(tabSize).toBe("3");

  writeFileSync(join(e2eConfig, "settings.json"), "{ broken");
  await expect(page.locator(".statusline .msg.error")).toContainText("settings.json");
  expect(await tabSize()).toBe("3");

  // A new binding works in Vim right away (the palette from <Space>zp).
  writeFileSync(join(e2eConfig, "keymap.json"), JSON.stringify([{ keys: "<Space>zp", command: "find.commands" }]));
  await expect.poll(async () => {
    await content.click();
    await page.keyboard.press("Escape");
    await page.keyboard.type(" zp");
    const open = await page.getByRole("dialog").isVisible().catch(() => false);
    if (open) await page.keyboard.press("Escape");
    return open;
  }).toBe(true);

  rmSync(join(e2eConfig, "settings.json"));
  rmSync(join(e2eConfig, "keymap.json"));
});

const hasGopls = (() => { try { execSync("command -v gopls", { shell: "/bin/sh" }); return true; } catch { return false; } })();

// M43: "inlayHints": true shows gopls' parameter names, saving it off again hides them.
test("inlay hints follow settings.json", async ({ page }) => {
  test.skip(!hasGopls, "gopls not in PATH");
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "hello.go" }).click();
  await expect(page.locator(".cm-content")).toContainText("Println");
  const hints = page.locator(".cm-inlay-hint");
  await page.waitForTimeout(500);
  await expect(hints).toHaveCount(0);
  writeFileSync(join(e2eConfig, "settings.json"), JSON.stringify({ inlayHints: true }));
  await expect(hints.first()).toBeVisible({ timeout: 30_000 });
  writeFileSync(join(e2eConfig, "settings.json"), JSON.stringify({ inlayHints: false }));
  await expect(hints).toHaveCount(0);
  rmSync(join(e2eConfig, "settings.json"));
});
