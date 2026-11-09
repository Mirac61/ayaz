import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

const hasClangd = (() => { try { execSync("command -v clangd", { shell: "/bin/sh" }); return true; } catch { return false; } })();

// M9: clangd through the same lsp stream; no compile_commands.json in the test workspace, so the hint shows.
test("clangd: hint, diagnostic, gd into a system header", async ({ page }) => {
  test.skip(!hasClangd, "clangd not in PATH");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "hello.c" }).click();
  const status = page.locator(".statusline");
  await expect(status).toContainText("no compile_commands.json", { timeout: 10_000 });
  await expect(page.locator(".cm-lintRange-error")).toBeVisible({ timeout: 30_000 });

  await page.locator(".cm-content").click();
  await page.keyboard.type("gg3j^"); // line 4: printf
  await page.keyboard.type("gd");
  await expect(status).toContainText(/\/include\/.*printf.*\.h|stdio\.h/, { timeout: 30_000 }); // macOS SDKs declare it in _printf.h
});
