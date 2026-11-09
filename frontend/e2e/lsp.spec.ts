import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

const hasGopls = (() => { try { execSync("command -v gopls", { shell: "/bin/sh" }); return true; } catch { return false; } })();

// M7: real gopls through the lsp stream: an error in broken.go shows as a lint marker.
test("gopls reports a diagnostic", async ({ page }) => {
  test.skip(!hasGopls, "gopls not in PATH");
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  await tree.getByRole("treeitem", { name: "broken.go" }).click();
  await expect(page.locator(".cm-content")).toContainText("undefinedThing");
  await expect(page.locator(".cm-lintRange-error")).toBeVisible({ timeout: 30_000 });
});
