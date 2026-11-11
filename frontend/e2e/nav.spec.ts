import { expect, test } from "./test";

// M18: Cmd+[ / Cmd+] go back and forward across files with the cursor; Cmd+Shift+T reopens a closed tab.
test("back/forward across files and reopen a closed tab", async ({ page }) => {
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  const status = page.locator(".statusline");
  await tree.getByRole("treeitem", { name: "hello.go" }).click();
  await expect(page.locator(".cm-content")).toContainText("package main");
  await page.keyboard.type("jj");
  await expect(status).toContainText("3:1");
  await tree.getByRole("treeitem", { name: "go.mod" }).click();
  await expect(page.locator(".titlebar")).toContainText("go.mod");

  await page.keyboard.press("Meta+BracketLeft");
  await expect(page.locator(".titlebar")).toContainText("hello.go");
  await expect(status).toContainText("3:1");
  await page.keyboard.press("Meta+BracketLeft");
  await expect(status).toContainText("At the start");
  await page.keyboard.press("Meta+BracketRight");
  await expect(page.locator(".titlebar")).toContainText("go.mod");

  await page.keyboard.type(" bd"); // close go.mod's tab: hello.go shows
  await expect(page.locator(".titlebar")).toContainText("hello.go");
  await page.keyboard.press("Meta+Shift+KeyT");
  await expect(page.locator(".titlebar")).toContainText("go.mod");
});
