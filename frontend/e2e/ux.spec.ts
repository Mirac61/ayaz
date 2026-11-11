import { expect, test, type Locator } from "./test";

const box = async (l: Locator) => (await l.boundingBox())!;

// Pickers show what is under the cursor: a file's start, or the lines around a search hit.
test("picker preview: files, then a search hit", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused(); // the app is ready for keys
  await page.keyboard.type(" ff");
  const picker = page.getByRole("dialog", { name: "Files" });
  await expect(picker).toBeVisible();
  await page.keyboard.type("hello.go");
  const preview = page.locator(".picker-preview");
  await expect(preview).toContainText("func hello()");
  await expect(preview.locator(".picker-preview-title")).toHaveText("hello.go");
  await page.keyboard.press("Escape");

  await page.keyboard.type(" fw");
  await page.keyboard.type('("hi")'); // only hello.go has it
  await expect(page.locator(".picker-preview .hit")).toContainText('fmt.Println("hi")');
  await expect(page.locator(".picker-preview-title")).toHaveText("hello.go");
});

// A path row keeps its file name whole and dims the folder.
test("picker rows dim the folder and keep the name", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused(); // the app is ready for keys
  await page.keyboard.type(" ff");
  await page.keyboard.type("greet");
  const row = page.locator(".picker-item").first();
  await expect(row.locator(".picker-dim")).toHaveText("src/");
  await expect(row.locator(".picker-rest")).toContainText("greet.go");
});

// Esc after the theme picker tried a theme puts the old one back; a pick keeps the new one.
test("theme picker previews the theme under the cursor", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused(); // the app is ready for keys
  const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg-1"));
  const before = await bg();
  await page.keyboard.type(" ft");
  await expect(page.getByRole("dialog", { name: "Theme" })).toBeVisible();
  await page.keyboard.press("Control+n");
  await expect.poll(bg).not.toBe(before);
  await page.keyboard.press("Escape");
  await expect.poll(bg).toBe(before);
});

// Which-key names its groups.
test("leader hints name the groups", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused(); // the app is ready for keys
  await page.keyboard.press("Space");
  await expect(page.getByRole("status", { name: "Next keys" })).toContainText("+debug");
});

// Right click on a tree row: a menu with the keys that do the same.
test("tree context menu", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused(); // the app is ready for keys
  const tree = page.getByRole("tree", { name: "Files" });
  await tree.getByRole("treeitem", { name: "README.md" }).click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toContainText("Rename…");
  await expect(menu.getByRole("menuitem", { name: /Rename/ })).toContainText("r");
  await menu.getByRole("menuitem", { name: /Rename/ }).click();
  await expect(page.getByRole("dialog", { name: /Rename "README.md" to/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await tree.getByRole("treeitem", { name: "notes.md" }).click({ button: "right" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

// The tab menu closes tabs; a middle click does too.
test("tab context menu and middle click", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused(); // the app is ready for keys
  const tree = page.getByRole("tree", { name: "Files" });
  for (const name of ["README.md", "notes.md", "hello.c"]) await tree.getByRole("treeitem", { name: name }).click();
  const tabs = page.locator(".tabbar .tab");
  await expect(tabs).toHaveCount(3);
  await tabs.nth(1).click({ button: "middle" });
  await expect(tabs).toHaveCount(2);

  await tabs.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close others" }).click();
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toContainText("README.md");
});

// The sidebar's edge drags; a double click on it goes back to the default width.
test("drag the sidebar edge", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused(); // the app is ready for keys
  const side = page.locator(".sidebar");
  const w0 = (await box(side)).width;
  const edge = page.locator(".sidebar .resize.row");
  const b = await box(edge);
  await page.mouse.move(b.x + b.width / 2, b.y + 200);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 120, b.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await box(side)).width).toBeGreaterThan(w0 + 100);

  await page.reload();
  await expect.poll(async () => (await box(side)).width).toBeGreaterThan(w0 + 100);
  await edge.dblclick();
  await expect.poll(async () => (await box(side)).width).toBeCloseTo(w0, 0);
});

// Prose files count their words; a selection says its size.
test("status line: words and selection size", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused(); // the app is ready for keys
  // notes.md: other specs change README.md and search.txt while this one runs
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "notes.md" }).click();
  await expect(page.locator(".statusline")).toContainText(/\d+ words/);
  await page.locator(".cm-content").click();
  await page.keyboard.type("ggVj");
  await expect(page.locator(".statusline .selected")).toContainText("2 lines");
});

// An empty window offers the files you had open.
test("empty window lists recent files", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused(); // the app is ready for keys
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "notes.md" }).click();
  await expect(page.locator(".titlebar")).toContainText("notes.md");
  await page.reload();
  await page.getByRole("tree", { name: "Files" }).focus();
  await page.keyboard.type(" bd"); // close the restored tab: the window is empty again
  await expect(page.locator(".pane-empty-file")).toContainText("notes.md");
});

// The worst diagnostic of a line shows after it; <Space>ud hides and shows them.
test("diagnostic text after the line, <Space>ud toggles it", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "broken.go" }).click();
  const text = page.locator(".cm-diag-text.error", { hasText: "undefined: undefinedThing" });
  await expect(text).toBeVisible({ timeout: 30_000 });
  await page.locator(".cm-content").click();
  await page.keyboard.type(" ud");
  await expect(text).toBeHidden();
  await expect(page.locator(".statusline")).toContainText("Diagnostic text off");
  await page.keyboard.type(" ud");
  await expect(text).toBeVisible();
});

// Cmd/Ctrl+Enter in a file picker opens the file in a split next to the current one.
test("open a picked file to the side", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "hello.go" }).click();
  await expect(page.locator(".titlebar")).toContainText("hello.go");
  await page.keyboard.type(" ff");
  await page.keyboard.type("notes.md");
  await expect(page.getByRole("dialog", { name: "Files" }).getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("[data-pane]")).toHaveCount(2);
  await expect(page.locator(".titlebar")).toContainText("notes.md");
  await expect(page.locator("[data-pane]").first().locator(".cm-content")).toContainText("func hello");
});

// "name:line" in Find files opens the file at that line, with the preview pointing at it.
test("find files with name:line", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.keyboard.type(" ff");
  await page.keyboard.type("hello.go:6");
  await expect(page.locator(".picker-preview .hit")).toContainText('fmt.Println("hi")');
  await page.keyboard.press("Enter");
  await expect(page.locator(".titlebar")).toContainText("hello.go");
  await expect(page.locator(".statusline .location")).toHaveText("6:1");
});

// qq starts a macro and the status line says so until q ends it.
test("status line shows macro recording", async ({ page }) => {
  await page.goto("/?renderer=dom");
  await expect(page.getByRole("tree", { name: "Files" })).toBeFocused();
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "hello.go" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.type("qq");
  await expect(page.locator(".statusline .recording")).toHaveText("recording @q");
  await page.keyboard.type("q");
  await expect(page.locator(".statusline .recording")).toHaveCount(0);
});

// The tree's header buttons do what the keys a (new) and the collapse button say.
test("tree header buttons", async ({ page }) => {
  await page.goto("/?renderer=dom");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  await tree.getByRole("treeitem", { name: "src" }).click(); // opens the folder
  await expect(tree.getByRole("treeitem", { name: "greet.go" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse all folders" }).click();
  await expect(tree.getByRole("treeitem", { name: "greet.go" })).toHaveCount(0);

  await page.getByRole("button", { name: "New file" }).click();
  await expect(page.getByRole("dialog", { name: /New file in/ })).toBeVisible();
  await page.keyboard.press("Escape");
});
