import { expect, test } from "@playwright/test";

const toggle = process.platform === "darwin" ? "Meta+j" : "Control+Shift+j";

// The whole path: keys → stream → Go → PTY shell in the workspace root → stream → xterm.
// ?renderer=dom: WebGL draws to a canvas, so there'd be no text to assert on.
test("terminal panel and split: shell in the workspace, modes, close", async ({ page }) => {
  await page.goto("/?renderer=dom");
  const status = page.locator(".statusline");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();

  await page.keyboard.type(" t"); // <Space>t fires after the 400 ms prefix timeout
  const panel = page.locator(".panel .xterm-rows");
  await expect(status).toContainText("TERMINAL");
  await page.keyboard.type("echo $PWD\n");
  await expect(panel).toContainText("ayaz-e2e-ws", { timeout: 10_000 });

  await page.keyboard.press("Control+Backslash");
  await page.keyboard.press("Control+n");
  await expect(status).toContainText("NORMAL");
  await page.keyboard.type("i");
  await expect(status).toContainText("TERMINAL");

  await page.keyboard.press(toggle); // hide; the shell keeps running
  await expect(page.locator(".panel")).toBeHidden();
  await page.keyboard.press(toggle);
  await expect(panel).toContainText("ayaz-e2e-ws");
  await expect(page.locator(".panel textarea")).toBeFocused(); // focus comes one frame after showing

  // :terminal in the empty editor pane takes it over (no split); `exit` brings the empty editor back
  await page.keyboard.press("Control+k");
  await page.keyboard.type(":terminal\n");
  await expect(page.locator(".panes .pane [data-term]")).toHaveCount(1);
  await expect(page.locator(".panes .pane")).toHaveCount(1);
  await page.keyboard.type("exit\n");
  await expect(page.locator(".panes .pane .cm-editor")).toBeVisible({ timeout: 10_000 });
});

// which-key: after <Space> a box lists what may follow, also inside the editor (where Vim runs the bindings).
test("leader hints", async ({ page }) => {
  await page.goto("/?renderer=dom");
  const hints = page.getByRole("status", { name: "Next keys" });
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(hints).toContainText("Toggle terminal panel");
  await expect(hints).toContainText("+9 keymaps"); // f leads to ff, fo, fb, fk, fw, fp, fs, fS, fd
  await page.keyboard.press("Escape");
  await expect(hints).toBeHidden();

  await page.keyboard.press("Control+l"); // into the editor
  await page.keyboard.press("Space");
  await page.keyboard.press("f");
  await expect(hints).toContainText("Find files");
  await page.keyboard.press("f");
  await expect(hints).toBeHidden();
  await expect(page.locator(".picker")).toBeVisible();
});

// M46: closing a terminal's pane hides it, the shell keeps running; <Space>fb lists it and brings it back.
test("hidden terminals come back from the buffer list", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "README.md" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.type(":terminal\n");
  const term = page.locator(".panes [data-term] .xterm-rows");
  await expect(term).toHaveCount(1);
  await page.keyboard.type("echo kept-$((40+2))\n");
  await expect(term).toContainText("kept-42", { timeout: 10_000 });

  await page.keyboard.press("Control+Backslash");
  await page.keyboard.press("Control+n");
  await page.keyboard.press("Control+w");
  await page.keyboard.type("c");
  await expect(page.locator(".panes [data-term]")).toHaveCount(0);
  await expect(page.locator(".panes .pane")).toHaveCount(1);

  await page.keyboard.type(" fb");
  const picker = page.getByRole("dialog", { name: "Buffers" });
  await expect(picker.getByRole("option", { name: /term:\/\/shell/ })).toBeVisible();
  await page.keyboard.type("term");
  await page.keyboard.press("Enter");
  await expect(term).toContainText("kept-42"); // the same shell, its output still there
  await expect(page.locator(".statusline")).toContainText("NORMAL"); // back in the mode it was hidden in
  await page.keyboard.type("i");
  await page.keyboard.type("exit\n"); // a shell that ends leaves the list
  await expect(page.locator(".panes [data-term]")).toHaveCount(0, { timeout: 10_000 });
  await page.keyboard.type(" fb");
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("option", { name: /term:\/\// })).toHaveCount(0);
});

// M47: zoom with a terminal focused sizes the terminal font only; elsewhere it stays the page zoom.
test("terminal zoom is its own", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.keyboard.type(" t");
  const rows = page.locator(".panel .xterm-rows");
  await expect(page.locator(".statusline")).toContainText("TERMINAL");
  const size = () => rows.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await size();
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+=`);
  await expect.poll(size).toBe(before + 1);
  expect(await page.evaluate(() => localStorage.getItem("ayaz.zoom"))).toBeNull(); // no page zoom
  await page.keyboard.press(`${mod}+0`);
  await expect.poll(size).toBe(before);
});
