import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { e2eWorkspace } from "../playwright.config";

// M13 done-when: two projects side by side, and switching folders needs no restart and tears the old one down.
// Two pages stand in for two windows (the server build has no native windows).
test("two windows, switch folder, old workspace closed", async ({ page, context }) => {
  const src = join(e2eWorkspace, "src");
  await page.goto("/");
  const wsOf = (p: typeof page) => p.locator(".workbench").getAttribute("data-ws");
  const fsStatus = (p: typeof page, url: string) => p.evaluate((u) => fetch(u).then((r) => r.status), url);
  await expect(page.getByRole("treeitem", { name: "README.md" })).toBeVisible();
  const first = await wsOf(page);
  await page.evaluate((root) => {
    const list = JSON.parse(localStorage.getItem("ayaz.folders") ?? "[]");
    localStorage.setItem("ayaz.folders", JSON.stringify([...list, { root, name: "src" }]));
  }, src);

  const second = await context.newPage();
  await second.goto("/?new");
  await second.getByRole("navigation", { name: "Recent folders" }).getByRole("button", { name: /^src/ }).click();
  await expect(second.getByRole("treeitem", { name: "main.go" })).toBeVisible();
  const secondWs = await wsOf(second);
  expect(secondWs).not.toBe(first);

  await page.getByRole("tree", { name: "Files" }).focus();
  await page.keyboard.type(" fp");
  const picker = page.getByRole("dialog", { name: "Switch folder" });
  await page.keyboard.type("/src");
  await expect(picker.getByRole("option", { selected: true })).toHaveText(/ayaz-e2e-ws\/src$/); // macOS resolves /var to /private/var
  await page.keyboard.press("Enter");
  await expect(page.getByRole("treeitem", { name: "main.go" })).toBeVisible();
  expect(await wsOf(page)).not.toBe(first);
  expect(await fsStatus(page, `/fs/${first}/README.md`)).toBe(404); // torn down
  expect(await fsStatus(second, `/fs/${secondWs}/main.go`)).toBe(200); // the other window is untouched
});
