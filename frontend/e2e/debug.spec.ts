import { expect, test } from "./test";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { e2eWorkspace } from "../playwright.config";

const hasDlv = (() => { try { execSync("command -v dlv", { shell: "/bin/sh" }); return true; } catch { return false; } })();

// M48 D6: a real Delve, on a small program the test writes into the workspace (a folder of its own in testdata would
// change the tree: other tests count on src/ being the only folder). Runs in its own project, after the others. Opt-in (AYAZ_DEBUG_E2E=1): on macOS the first debugging session asks for developer tools access
// (an authorization dialog, or `sudo DevToolsSecurity -enable` once), which a routine test run must not trigger.
test("debug a Go program: breakpoint, stop, variables, step, continue to the end", async ({ page }) => {
  test.skip(!hasDlv, "dlv not in PATH");
  test.skip(process.env.AYAZ_DEBUG_E2E !== "1", "set AYAZ_DEBUG_E2E=1 to run it (needs developer tools access on macOS)");
  test.setTimeout(120_000);
  mkdirSync(join(e2eWorkspace, "zdebug"), { recursive: true });
  writeFileSync(join(e2eWorkspace, "zdebug", "main.go"), `package main

import "fmt"

func main() {
	total := 0
	for i := 1; i <= 3; i++ {
		total += i
	}
	fmt.Println("total", total)
	println("to stderr") // the builtin writes to stderr
}
`);
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  await tree.getByRole("treeitem", { name: "zdebug" }).click();
  await tree.getByRole("treeitem", { name: "main.go" }).click();
  const code = page.locator(".cm-content");
  await expect(code).toContainText("total += i");
  const dots = page.locator(".cm-bp .cm-gutterElement:not([style*='visibility']) .cm-bp-dot");
  await page.keyboard.type("gg7j db"); // line 8: total += i
  await expect(dots).toHaveCount(1);

  await page.keyboard.type(" dd");
  const status = page.locator(".statusline");
  await expect(status).toContainText("DEBUG paused", { timeout: 90_000 }); // Delve builds the program first
  await expect(page.locator(".cm-debug-line")).toContainText("total += i");

  await page.keyboard.type(" dv");
  const picker = page.getByRole("dialog", { name: /Variables/ });
  await expect(picker.getByRole("option", { name: /i = 1/ })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");

  await page.keyboard.press("F10"); // over the line: the loop's i++ line, or the next one
  await expect(status).toContainText("DEBUG paused");
  await expect(page.locator(".cm-debug-line")).not.toContainText("total += i");

  for (let i = 0; i < 6 && (await status.textContent())?.includes("DEBUG"); i++) {
    await page.keyboard.press("F5"); // two more stops at the breakpoint, then the program ends
    await page.waitForTimeout(1500);
  }
  await expect(status).not.toContainText("DEBUG");
  await page.keyboard.type(" dl");
  await expect(code).toContainText("total 6");
  await expect(code).toContainText("to stderr");
});
