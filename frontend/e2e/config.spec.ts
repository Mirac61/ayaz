import { expect, test } from "./test";
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

// "theme" picks a built-in theme, "themes" holds your own on top of another; both apply when saved, a wrong name is reported.
test("theme and themes in settings.json recolor the chrome, the code and the terminal's page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "search.txt" }).click();
  const root = page.locator("html");
  const bg = () => root.evaluate((el) => getComputedStyle(el).getPropertyValue("--bg-0").trim());
  const syn = () => root.evaluate((el) => getComputedStyle(el).getPropertyValue("--syn-keyword").trim());
  await expect.poll(bg).toBe("#161617"); // graphite, the default

  writeFileSync(join(e2eConfig, "settings.json"), JSON.stringify({ theme: "tokyo-night" }));
  await expect.poll(bg).toBe("#16161e");
  await expect.poll(syn).toBe("#bb9af7");

  writeFileSync(
    join(e2eConfig, "settings.json"),
    JSON.stringify({ theme: "mine", themes: { mine: { extends: "gruvbox-dark", ui: { bg0: "#101014" } } } }),
  );
  await expect.poll(bg).toBe("#101014");
  expect(await root.evaluate((el) => getComputedStyle(el).getPropertyValue("--bg-1").trim())).toBe("#282828");

  writeFileSync(join(e2eConfig, "settings.json"), JSON.stringify({ theme: "nope" }));
  await expect(page.locator(".statusline .msg.error")).toContainText('unknown theme "nope"');
  expect(await bg()).toBe("#101014"); // the last good theme stays

  rmSync(join(e2eConfig, "settings.json"));
  await expect.poll(bg).toBe("#161617");
});

const hasGo = (() => { try { execSync("command -v go", { shell: "/bin/sh" }); return true; } catch { return false; } })();

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

// "statusline": "bottom" moves mode and meta under the code, the file stays on top; statusColors recolor the mode.
test("status line at the bottom, with its own colors", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "search.txt" }).click();
  await expect(page.locator("header.statusline .mode")).toHaveText("normal");
  writeFileSync(join(e2eConfig, "settings.json"), JSON.stringify({ statusline: "bottom", statusColors: { normal: "#ff0000" } }));
  const bottom = page.locator("footer.statusline");
  await expect(bottom.locator(".mode")).toHaveText("normal");
  await expect(bottom.locator(".mode")).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(page.locator("header.titlebar")).toContainText("search.txt");
  await expect(page.locator("header.statusline")).toHaveCount(0);
  rmSync(join(e2eConfig, "settings.json"));
  await expect(page.locator("header.statusline .mode")).toHaveCSS("color", "rgb(126, 156, 216)"); // back to the default
});

// M52: a task from settings.json runs in a split; its file:line:col lines land in the quickfix list.
test("task: go vet on broken.go fills the quickfix list, <Space>rl runs it again", async ({ page }) => {
  test.skip(!hasGo, "go not in PATH");
  writeFileSync(join(e2eConfig, "settings.json"), JSON.stringify({ tasks: { vet: "go vet ./broken.go" } }));
  await page.goto("/?renderer=dom");
  const status = page.locator(".statusline");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "README.md" }).click();
  await expect(page.locator(".cm-content")).toContainText(/\S/); // the file's late focus would eat the Enter below
  await page.keyboard.press("Space");
  await page.keyboard.type("rr");
  await expect(page.getByRole("dialog", { name: "Run task" })).toContainText("go vet ./broken.go");
  await page.keyboard.press("Enter");
  // The quickfix list jumps to the first entry; its message may give way to gopls' own on opening broken.go.
  await expect(page.locator(".titlebar")).toContainText("broken.go", { timeout: 15_000 });
  await expect(status).toContainText("4:2");
  await expect(page.locator("[data-term]")).toContainText("[process exited]"); // the pane stays with the output

  await page.keyboard.press("Space");
  await page.keyboard.type("rl");
  await expect(page.locator("[data-term]")).toHaveCount(2);
  await expect(page.locator("[data-term]").nth(1)).toContainText("undefinedThing", { timeout: 15_000 });
  rmSync(join(e2eConfig, "settings.json"));
});
