import { expect, test } from "./test";

const toggle = process.platform === "darwin" ? "Meta+j" : "Control+Shift+j";

// The whole path: keys → stream → Go → PTY shell in the workspace root → stream → xterm.
// ?renderer=dom: WebGL draws to a canvas, so there'd be no text to assert on.
test("terminal panel and split: shell in the workspace, modes, close", async ({ page }) => {
  await page.goto("/?renderer=dom");
  const status = page.locator(".statusline");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();

  await page.keyboard.type(" t"); // <Space>t fires after the 400 ms prefix timeout
  const panel = page.locator(".panel .xterm-rows");
  await expect(status).toContainText("TERM");
  await page.keyboard.type("echo $PWD\n");
  await expect(panel).toContainText("ayaz-e2e-ws", { timeout: 10_000 });

  await page.keyboard.press("Control+Backslash");
  await page.keyboard.press("Control+n");
  await expect(status).toContainText("NORMAL");
  await page.keyboard.type("i");
  await expect(status).toContainText("TERM");

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
  await expect(page.locator(".panes .pane-term")).toHaveCount(0); // nothing left to take the editor's room
});

// which-key: after <Space> a box lists what may follow, also inside the editor (where Vim runs the bindings).
test("leader hints", async ({ page }) => {
  await page.goto("/?renderer=dom");
  const hints = page.getByRole("status", { name: "Next keys" });
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(hints).toContainText("Toggle terminal panel");
  await expect(hints).toContainText("+find"); // a named group: f leads to ff, fo, fb, fk, fw, fp, fs, fS, fd, fh, ft
  await expect(hints).toContainText("+debug");
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
  await expect(page.locator(".panes .xterm-helper-textarea")).toBeFocused(); // the palette closes first
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
  await expect(page.locator(".statusline")).toContainText("TERM");
  const size = () => rows.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await size();
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+=`);
  await expect.poll(size).toBe(before + 1);
  expect(await page.evaluate(() => localStorage.getItem("ayaz.zoom"))).toBeNull(); // no page zoom
  await page.keyboard.press(`${mod}+0`);
  await expect.poll(size).toBe(before);
});

// A terminal is a tab beside the files: switching hides the shell, it runs on; closing the tab ends it.
test("terminal tab: shell next to the files, kept when switching, ended when closed", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "README.md" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.type(":Terminal in a tab\n");
  const term = page.locator(".panes [data-term] .xterm-rows");
  const tabs = page.locator(".panes .tabbar .tab");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveClass(/active/);
  await expect(term).toHaveCount(1);
  await expect(page.locator(".panes .xterm-helper-textarea")).toBeFocused();
  await page.keyboard.type("echo tabbed-$((40+2))\n");
  await expect(term).toContainText("tabbed-42", { timeout: 10_000 });

  await tabs.nth(0).dispatchEvent("mousedown"); // back to the file: the shell hides
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".panes [data-term]")).toHaveCount(0);
  await tabs.nth(1).dispatchEvent("mousedown");
  await expect(term).toContainText("tabbed-42"); // the same shell

  await tabs.nth(1).locator(".tab-close").dispatchEvent("mousedown");
  await expect(tabs).toHaveCount(1);
  await expect(page.locator(".cm-content")).toBeVisible();
});

// The palette runs ex lines and the project's Makefile targets.
test("palette: ':' runs ex lines and lists tasks", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "README.md" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.type(":");
  const palette = page.getByRole("dialog", { name: "Commands" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("split");
  await expect(palette.getByRole("option").first()).toContainText("plit");
  await page.keyboard.press("Escape");
});

// The + at the end of the tab bar: New terminal adds a terminal tab next to the file's.
test("tab bar +: New terminal opens a second tab", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "README.md" }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  const tabs = page.locator(".panes .tabbar .tab");
  await expect(tabs).toHaveCount(1);
  await page.locator(".panes .tabbar .tab-plus").dispatchEvent("mousedown");
  await page.getByRole("menuitem", { name: "New terminal" }).dispatchEvent("mousedown");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveClass(/active/);
  await expect(page.locator(".panes .xterm-helper-textarea")).toBeFocused();
});

// The title bar's buttons: palette and sidebar; the file's path sits in its middle.
test("title bar: palette and sidebar buttons, the path of the open file", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "README.md" }).click();
  await expect(page.locator(".titlebar")).toContainText("README.md");
  await page.getByRole("button", { name: "Command palette" }).dispatchEvent("mousedown");
  await expect(page.getByRole("dialog", { name: "Commands" })).toBeVisible();
  await page.keyboard.press("Escape");
  const sidebar = page.locator(".sidebar");
  await expect(sidebar).toBeVisible();
  await page.getByRole("button", { name: "Sidebar" }).dispatchEvent("mousedown");
  await expect(sidebar).toBeHidden();
});

// The panel's tab dropped on an editor's top edge: the shell moves into the new split above, the panel goes.
// Unmounting the panel first ended the shell and left two empty panes, the old one with its tab strip at the bottom.
test("panel terminal dragged to a split", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.keyboard.type(" t");
  await expect(page.locator(".panel .xterm-rows")).toBeVisible();
  const tab = (await page.locator(".panel-head .tab").boundingBox())!;
  const pane = (await page.locator(".panes .pane").boundingBox())!;
  await page.mouse.move(tab.x + 20, tab.y + 10);
  await page.mouse.down();
  await page.mouse.move(pane.x + pane.width / 2, pane.y + 20, { steps: 10 });
  await page.mouse.up();

  await expect(page.locator(".panes .pane")).toHaveCount(2);
  await expect(page.locator(".panes .pane-term")).toHaveCount(1);
  await expect(page.locator(".panel")).toHaveCount(0);
  await page.keyboard.type("echo $PWD\n");
  await expect(page.locator(".panes .xterm-rows")).toContainText("ayaz-e2e-ws", { timeout: 10_000 });
  // the empty pane below: its tab strip sits above its editor
  const empty = page.locator(".panes .pane", { has: page.locator(".cm-editor") });
  const strip = (await empty.locator(":scope > .tabbar").boundingBox())!;
  const editor = (await empty.locator(":scope > .cm-editor").boundingBox())!;
  expect(strip.y).toBeLessThan(editor.y);
});
