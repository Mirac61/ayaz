import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { e2eWorkspace } from "../playwright.config";

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

// M21: E/W counts in the status line, the list as quickfix (errors first), ]d to the next one in the file.
test("diagnostics: counts, list and ]d", async ({ page }) => {
  test.skip(!hasGopls, "gopls not in PATH");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "broken.go" }).click();
  const status = page.locator(".statusline");
  // undefinedThing, and hello.c in the package for broken.go and hello.go (not open: the store still has it)
  await expect(status.locator(".diag .e")).toContainText("3 errors", { timeout: 30_000 });
  await page.keyboard.type("gg]d");
  await expect(status).toContainText("4:2");
  await status.locator(".diag").click();
  await expect(status).toContainText("(1 of 3) error: C source files"); // errors first, then file and line
  await page.keyboard.type(":copen\n");
  await expect(page.getByRole("dialog", { name: /Quickfix: Diagnostics/ }).getByRole("option")).toHaveText([
    /broken\.go:1:1: error: C source files/, /broken\.go:4:2: error: undefined: undefinedThing/, /hello\.go:1:1: error: C source/,
  ]);
});

// M25: K shows the hover text, <Space>cr renames across files (the clean one is saved), <Space>ca lists actions.
test("hover, rename across files, code actions", async ({ page }) => {
  test.skip(!hasGopls, "gopls not in PATH");
  await page.goto("/");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.keyboard.type(" ff");
  await page.keyboard.type("greetgo");
  await expect(page.getByRole("option", { selected: true })).toHaveText(/src\/greet\.go/);
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText("func greet");
  await page.keyboard.type("gg2jw"); // line 3: func greet
  await expect(async () => {
    await page.keyboard.type("K");
    await expect(page.locator(".cm-lsp-hover-tooltip")).toContainText("func greet() string", { timeout: 2000 });
  }).toPass({ timeout: 30_000 }); // gopls may still be loading the package
  await page.keyboard.type("l");
  await expect(page.locator(".cm-lsp-hover-tooltip")).toHaveCount(0);

  await page.keyboard.type(" cr");
  const input = page.getByRole("combobox", { name: "Search" });
  await expect(input).toHaveValue("greet");
  await input.fill("salute");
  await page.keyboard.press("Enter");
  await expect(page.locator(".statusline")).toContainText("Renamed in 2 files");
  expect(readFileSync(join(e2eWorkspace, "src", "main.go"), "utf8")).toContain("salute()");
  await expect(page.locator(".cm-content")).toContainText("func salute");

  await page.keyboard.type(" ca");
  await expect(page.getByRole("dialog", { name: /Code actions/ }).getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Escape");
});

// M43: typing a call shows the signature (lsp-client's signatureHelp, also in Vim's insert mode).
test("signature help while typing a call", async ({ page }) => {
  test.skip(!hasGopls, "gopls not in PATH");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "hello.go" }).click();
  await expect(page.locator(".cm-content")).toContainText("Println");
  await page.locator(".cm-content").click();
  await expect(page.locator(".statusline")).not.toContainText("still starting", { timeout: 30_000 });
  await page.keyboard.type("gg5jo");
  await page.keyboard.type("fmt.Printf(");
  await expect(page.locator(".cm-lsp-signature-tooltip")).toContainText("format string", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await page.keyboard.type("u");
});

// M44: an action whose edit creates a file (gopls' "Extract declarations to new file").
test("a code action can create a file", async ({ page }) => {
  test.skip(!hasGopls, "gopls not in PATH");
  writeFileSync(join(e2eWorkspace, "src", "spare.go"), "package main\n\nfunc spare() int {\n\treturn 1\n}\n");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "src" }).click();
  await page.keyboard.press("l");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "spare.go" }).click();
  await expect(page.locator(".cm-content")).toContainText("func spare");
  await page.keyboard.type("gg2jw"); // on "spare"
  const picker = page.getByRole("dialog", { name: /Code actions/ });
  await expect(async () => {
    await page.keyboard.type(" ca");
    await expect(picker.getByRole("option", { name: /to new file/ })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 }); // gopls may still be loading the package
  await page.keyboard.type("new file");
  await page.keyboard.press("Enter");
  const made = join(e2eWorkspace, "src", "spare.1.go"); // gopls' name for it
  await expect.poll(() => existsSync(made) && readFileSync(made, "utf8"), { timeout: 10_000 }).toContain("func spare");
  expect(readFileSync(join(e2eWorkspace, "src", "spare.go"), "utf8")).not.toContain("func spare");
  await expect(page.locator(".statusline .msg.error")).toHaveCount(0);
});
