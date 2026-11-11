import { expect, test } from "./test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// Without a content type WebKit sniffs: "<title>…" renders as a page, a bare "<h1>" as plain text.
const page200 = (html: string) => createServer((_, res) => res.writeHead(200, { "content-type": "text/html" }).end(html));

// The browser tab shows a local page, remembers it in the tab, and turns anything but localhost down.
test("browser tab: local page, tab title, no remote addresses", async ({ page }) => {
  const server = page200("<title>t</title><h1>from the dev server</h1>");
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as AddressInfo).port;
  try {
    await page.goto("/");
    await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "hello.go" }).click();
    await expect(page.locator(".cm-content")).toContainText("func hello");
    // The browser tab doesn't take keyboard focus (keys inside a page never reach the app), so each :browse starts from the editor.
    const browse = async (address: string | number) => {
      await page.getByRole("tab", { name: "hello.go" }).click();
      await page.locator(".cm-content").click();
      await page.keyboard.type(`:browse ${address}`);
      await page.keyboard.press("Enter");
    };
    await browse(port);
    await expect(page.frameLocator("iframe[title=Browser]").locator("h1")).toHaveText("from the dev server");
    await expect(page.locator(".tab.active")).toContainText(`localhost:${port}`);
    await expect(page.locator(".statusline")).toContainText(`http://localhost:${port}/`);

    await browse("example.com");
    await expect(page.getByRole("tab", { name: /^localhost:/ })).toHaveCount(1); // no second browser tab for example.com

    // A server that isn't up yet: the waiting screen, then the page by itself once it answers.
    const late = page200("<h1>now up</h1>");
    await new Promise<void>((done) => late.listen(0, "127.0.0.1", done));
    const lateport = (late.address() as AddressInfo).port;
    await new Promise((done) => late.close(done));
    await browse(lateport);
    await expect(page.locator(".browser-waiting-title")).toContainText(`Nothing is listening on localhost:${lateport}`);
    await new Promise<void>((done) => late.listen(lateport, "127.0.0.1", done));
    await expect(page.frameLocator("iframe[title=Browser]").locator("h1")).toHaveText("now up", { timeout: 8000 });
    late.close();
  } finally {
    server.close();
  }
});
