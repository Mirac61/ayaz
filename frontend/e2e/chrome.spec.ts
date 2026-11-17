import { expect, test, type Page } from "./test";

const toggleGlass = async (page: Page) => {
  await page.keyboard.type(" fk"); // <Space>fk: the command palette
  await page.keyboard.type("Toggle transparency");
  await page.keyboard.press("Enter");
};

// AYAZ_SHOTS=1 writes the pictures for a PR description to docs/screenshots/ (not on every run).
const shot = async (page: Page, name: string) => {
  if (process.env.AYAZ_SHOTS) {
    await page.screenshot({ path: `../docs/screenshots/${name}.png` });
  }
};

// Headless there is no window backdrop; a wallpaper-like gradient behind the page shows what see-through looks like.
const wallpaper = (page: Page) =>
  page.addStyleTag({
    content: `.notifications-container { display: none; }
      html::before { content: ""; position: fixed; inset: 0; z-index: -1;
      background: radial-gradient(60% 60% at 20% 20%, #5b7fb5, transparent), radial-gradient(70% 70% at 85% 80%, #b5795b, #2c3e5c); }`,
  });

// The sidebar header and the tab strip are one band: same top, same height, same bottom line.
// Every icon in the header sits in the middle of its box.
test("sidebar header and tab strip line up, icons are centered", async ({ page }) => {
  await page.goto("/?renderer=dom");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  await tree.getByRole("treeitem", { name: "README.md" }).click();
  await expect(page.locator(".titlebar")).toContainText("README.md");

  const head = (await page.locator(".sidebar-title").boundingBox())!;
  const strip = (await page.locator(".pane .tabbar").first().boundingBox())!;
  expect(strip.y).toBeCloseTo(head.y, 1);
  expect(strip.height).toBeCloseTo(head.height, 1);
  const line = (sel: string) =>
    page
      .locator(sel)
      .first()
      .evaluate((el) => getComputedStyle(el).borderBottom);
  expect(await line(".pane .tabbar")).toBe(await line(".sidebar-title"));

  for (const btn of await page.locator(".sidebar-title button").all()) {
    const b = (await btn.boundingBox())!;
    const i = (await btn.locator("svg").boundingBox())!;
    if ((await btn.locator(".sidebar-tab-badge").count()) === 0) {
      // with a change count the icon and the badge are centered together
      expect(i.x + i.width / 2, "icon, horizontally").toBeCloseTo(b.x + b.width / 2, 0);
    }
    expect(i.y + i.height / 2, "icon, vertically").toBeCloseTo(b.y + b.height / 2, 0);
    expect(b.y + b.height / 2, "box in the header").toBeCloseTo(head.y + (head.height - 1) / 2, 0);
  }
  await shot(page, "ui-overhaul-normal");
});

// Glass: the surfaces are the theme's own colours with alpha (not a fixed blue), an inactive tab stays see-through.
test("glass surfaces derive from the theme and the header line stays", async ({ page }) => {
  await page.goto("/?renderer=dom");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  await tree.getByRole("treeitem", { name: "README.md" }).click();
  await expect(page.locator(".titlebar")).toContainText("README.md");
  await toggleGlass(page);
  await expect(page.locator("html")).toHaveAttribute("data-glass", /.*/);
  for (const sel of ["html", "body", "#root", ".panes", ".sidebar-title"]) {
    // nothing under the surfaces adds a layer: else the glass is nearly opaque; the sidebar header shows the sidebar's colour
    expect(await page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor), sel).toBe("rgba(0, 0, 0, 0)");
  }
  // an empty sticky-scroll panel must not stay as a 4 px strip of its own colour under the titlebar
  await expect(page.locator(".cm-sticky")).toBeHidden();
  const css = (sel: string, prop: string) =>
    page
      .locator(sel)
      .first()
      .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
  const side = await css(".sidebar", "background-color");
  expect(side).toMatch(/0\.\d+\)$/); // translucent
  expect(side).toMatch(/^color\(srgb 0\.08|^rgba\(22, 22, 23/); // graphite's #161617, not a blue
  const head = (await page.locator(".sidebar-title").boundingBox())!;
  const strip = (await page.locator(".pane .tabbar").first().boundingBox())!;
  expect(strip.height).toBeCloseTo(head.height, 1);
  expect(await css(".pane .tabbar", "border-bottom-color")).toBe(await css(".sidebar-title", "border-bottom-color"));
  await wallpaper(page);
  await shot(page, "ui-overhaul-glass");
});

// An empty window: the actions, the key of each, and the project switch (<Space>fp) with the folders you had open.
test("empty window offers the project switch", async ({ page }) => {
  const now = Date.now();
  await page.addInitScript((t) => {
    localStorage.setItem(
      "ayaz.folders",
      JSON.stringify([
        { root: "/work/atlas", name: "atlas", at: t - 2 * 3_600_000 },
        { root: "/work/harbor", name: "harbor", at: t - 26 * 3_600_000 },
        { root: "/work/notes", name: "notes", at: t - 9 * 86_400_000 },
      ]),
    );
  }, now);
  await page.goto("/?renderer=dom");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  await tree.getByRole("treeitem", { name: "notes.md" }).click();
  await expect(page.locator(".titlebar")).toContainText("notes.md");
  await tree.focus();
  await page.keyboard.type(" bd"); // close the tab: the window is empty again, notes.md is a recent file
  const hub = page.locator(".pane-empty");
  await expect(hub).toContainText("Switch project");
  await expect(hub.locator(".hub-row", { hasText: "Switch project" }).locator("kbd")).toHaveText("<Space>fp");
  await expect(hub.locator(".hub-project")).toHaveCount(3);
  await expect(hub.locator(".pane-empty-file")).toContainText("notes.md");
  await shot(page, "ui-overhaul-start");
  await toggleGlass(page);
  await expect(page.locator("html")).toHaveAttribute("data-glass", /.*/);
  await wallpaper(page);
  await shot(page, "ui-overhaul-start-glass");
});

// Glass: the tree's context menu blurs what is under it like the picker, else the rows' text reads through its labels.
test("glass: the tree's context menu blurs the rows under it and its labels are heavier", async ({ page }) => {
  await page.goto("/?renderer=dom");
  const tree = page.getByRole("tree", { name: "Files" });
  await expect(tree).toBeFocused();
  await toggleGlass(page);
  await expect(page.locator("html")).toHaveAttribute("data-glass", /.*/);
  await wallpaper(page);
  await tree.getByRole("treeitem", { name: "README.md" }).click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter)).toContain(
    "blur",
  );
  expect(
    await menu
      .getByRole("menuitem")
      .first()
      .evaluate((el) => getComputedStyle(el).fontWeight),
  ).toBe("500");
  await menu.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); // the shot after the fade-in
  await shot(page, "pr-context-menu-glass");
});
