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

// gd into the standard library opens the file outside the workspace, read-only.
test("gd into the Go stdlib opens a read-only buffer", async ({ page }) => {
  test.skip(!hasGopls, "gopls not in PATH");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "hello.go" }).click();
  await expect(page.locator(".cm-content")).toContainText("Println");
  await page.locator(".cm-content").click();
  await page.keyboard.type("gg5j"); // line 6: fmt.Println("hi")
  await page.keyboard.type("^4lgd"); // ^ then onto Println
  await expect(page.locator(".statusline")).toContainText("fmt/print.go", { timeout: 30_000 });
  await page.keyboard.type("x");
  await page.waitForTimeout(200);
  await expect(page.locator(".statusline .dirty")).toHaveCount(0);
});

// gr fills the quickfix list from gopls.
test("gr lists references in quickfix", async ({ page }) => {
  test.skip(!hasGopls, "gopls not in PATH");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "hello.go" }).click();
  await expect(page.locator(".cm-content")).toContainText("func hello");
  await page.locator(".cm-content").click();
  await page.keyboard.type("gg4jw"); // line 5: func hello
  await expect(async () => {
    await page.keyboard.type("gr");
    await expect(page.locator(".statusline")).toContainText("(1 of 1) func hello() {", { timeout: 2000 });
  }).toPass({ timeout: 30_000 }); // gopls may still be loading the package
});

// M20: symbols in the file and in the project through gopls; Enter jumps.
test("symbol pickers find hello and jump to it", async ({ page }) => {
  test.skip(!hasGopls, "gopls not in PATH");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "hello.go" }).click();
  await expect(page.locator(".cm-content")).toContainText("Println");
  const status = page.locator(".statusline");

  await page.keyboard.type(" fs");
  const file = page.getByRole("dialog", { name: /Symbols in file/ });
  await expect(file.getByRole("option").first()).toContainText("hello", { timeout: 30_000 });
  await page.keyboard.press("Enter");
  await expect(status).toContainText("5:1"); // gopls sends SymbolInformation: the whole declaration

  await page.keyboard.type("gg fS");
  const project = page.getByRole("dialog", { name: /Symbols in project/ });
  await page.keyboard.type("main");
  await expect(project.getByRole("option").filter({ hasText: "broken.go" })).toHaveCount(1, { timeout: 30_000 });
  await project.getByRole("option").filter({ hasText: "broken.go" }).click();
  await expect(status).toContainText("broken.go");
});
