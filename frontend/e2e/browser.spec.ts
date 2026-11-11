import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// The browser tab shows a local page, remembers it in the tab, and turns anything but localhost down.
test("browser tab: local page, tab title, no remote addresses", async ({ page }) => {
  const server = createServer((_, res) => res.end("<title>t</title><h1>from the dev server</h1>"));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as AddressInfo).port;
  try {
    await page.goto("/");
    await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "hello.go" }).click();
    await expect(page.locator(".cm-content")).toContainText("func hello");
    await page.keyboard.type(`:browse ${port}`);
    await page.keyboard.press("Enter");
    await expect(page.frameLocator("iframe[title=Browser]").locator("h1")).toHaveText("from the dev server");
    await expect(page.locator(".tab.active")).toContainText(`localhost:${port}`);
    await expect(page.locator(".statusline")).toContainText(`http://localhost:${port}/`);

    await page.keyboard.type(":browse example.com");
    await page.keyboard.press("Enter");
    await expect(page.locator("iframe[title=Browser]")).toHaveCount(1); // still the old tab, no second one

    // A server that isn't up yet: the waiting screen, then the page by itself once it answers.
    const late = createServer((_, res) => res.end("<h1>now up</h1>"));
    await new Promise<void>((done) => late.listen(0, "127.0.0.1", done));
    const lateport = (late.address() as AddressInfo).port;
    await new Promise((done) => late.close(done));
    await page.keyboard.type(`:browse ${lateport}`);
    await page.keyboard.press("Enter");
    await expect(page.locator(".browser-waiting-title")).toContainText(`Nothing is listening on localhost:${lateport}`);
    await new Promise<void>((done) => late.listen(lateport, "127.0.0.1", done));
    await expect(page.frameLocator("iframe[title=Browser]").locator("h1")).toHaveText("now up", { timeout: 8000 });
    late.close();
  } finally {
    server.close();
  }
});
