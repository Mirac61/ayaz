import { expect, test } from "@playwright/test";
import { e2eWorkspace } from "../playwright.config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// M16: splits, files and cursors come back when the folder opens again (here: a reload).
test("session: splits, files, active pane and cursor survive a reload", async ({ page }) => {
  writeFileSync(join(e2eWorkspace, "session.txt"), "red gray\ngray blue\n"); // own file and words: tests run in parallel, search.spec greps
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  const status = page.locator(".statusline");
  await expect(tree).toBeFocused();
  await page.keyboard.press("/"); // the tree draws only the rows that fit, and this file sorts late: filter first
  await page.keyboard.type("session.txt");
  await tree.getByRole("treeitem", { name: "session.txt" }).click();
  await expect(page.locator(".cm-content")).toContainText("red gray");
  await page.keyboard.type("jw"); // line 2, second word
  await expect(status).toContainText("2:6");
  await page.keyboard.type(":vsplit");
  await page.keyboard.press("Enter");
  await page.keyboard.type(":e README.md");
  await page.keyboard.press("Enter");
  await expect(status).toContainText("README.md");
  await page.waitForTimeout(800); // the session saves 500 ms after the last change

  await page.reload();
  await expect(page.locator("[data-pane]")).toHaveCount(2);
  await expect(status).toContainText("README.md");
  await page.keyboard.press("Control+h");
  await expect(status).toContainText("session.txt");
  await expect(status).toContainText("2:6");
  // A split made after the restore keeps the focus (the restore doesn't pull it back to the session's pane).
  await page.keyboard.type(":vsplit");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-pane]")).toHaveCount(3);
  await page.waitForTimeout(100);
  await expect(status).toContainText("session.txt");
});

// M38: a Markdown preview comes back as a preview, a terminal as a new shell in the folder.
test("session: preview and terminal panes come back as what they were", async ({ page }) => {
  writeFileSync(join(e2eWorkspace, "session2.md"), "# Session two\n\nsome *text*\n");
  await page.goto("/?renderer=dom"); // WebGL draws to a canvas, so there'd be no text to assert on
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  await page.keyboard.press("/"); // the tree draws only the rows that fit, and this file sorts late: filter first
  await page.keyboard.type("session2.md");
  await tree.getByRole("treeitem", { name: "session2.md" }).click();
  await expect(page.locator(".cm-content")).toContainText("Session two");
  await page.keyboard.press(" ");
  await page.keyboard.type("mp");
  await expect(page.locator("[data-pane]")).toHaveCount(2);
  await page.keyboard.type(":terminal");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-pane]")).toHaveCount(3);
  await expect(page.locator("[data-term]")).toHaveCount(1);
  const saved = () => page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("ayaz.session:"));
    const s = k ? JSON.parse(localStorage.getItem(k)!) : null;
    return `${s?.previews?.length ?? 0} ${Object.keys(s?.terms ?? {}).length}`;
  });
  await expect.poll(saved).toBe("1 1"); // saved at most 500 ms after the last change

  await page.reload();
  await expect(page.locator("[data-pane]")).toHaveCount(3);
  await expect(page.locator("[data-term]")).toHaveCount(1);
  await expect(page.locator("[data-term] .xterm-rows")).toContainText(/\S/); // the shell is alive: its prompt
  await expect(page.locator(".cm-reading")).toHaveCount(1);
});

// M48 D3: <Space>db puts a breakpoint dot on the line, and the session brings it back after a reload.
test("breakpoints: toggled with <Space>db, kept in the session", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "hello.go" }).click();
  await expect(page.locator(".cm-content")).toContainText("func hello");
  await page.locator(".cm-content").click();
  await page.keyboard.type("gg5j db"); // the line with fmt.Println
  const dots = () => page.locator(".cm-bp .cm-gutterElement:not([style*='visibility']) .cm-bp-dot");
  await expect(dots()).toHaveCount(1);
  const saved = () => page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("ayaz.session:"));
    return JSON.stringify(k ? JSON.parse(localStorage.getItem(k)!).breakpoints : null);
  });
  await expect.poll(saved).toBe('{"hello.go":[6]}'); // saved at most 500 ms after the change

  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("func hello");
  await expect(dots()).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.keyboard.type("gg5j db"); // off again
  await expect(dots()).toHaveCount(0);
  await expect.poll(saved).toBe("{}");
});
