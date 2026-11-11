import { expect, test } from "@playwright/test";

// M10 done-when: all five formats open in the viewer, zoom by keyboard, and a text file brings the editor back.
test("image viewer: formats, zoom, back to the editor", async ({ page }) => {
  await page.goto("/");
  const tree = page.getByRole("tree", { name: "Files" });
  const status = page.locator(".statusline");
  for (const f of ["pic.png", "pic.jpg", "anim.gif", "pic.webp", "logo.svg"]) {
    await tree.getByRole("treeitem", { name: f }).click();
    await expect(page.locator(".titlebar")).toContainText(f);
    await expect(status).toContainText("100% fit  64×32");
  }
  expect(await page.evaluate(() => (window as { pwned?: number }).pwned)).toBeUndefined(); // SVG scripts don't run

  await page.keyboard.type("++");
  await expect(status).toContainText("156%  64×32");
  await page.keyboard.type("0");
  await expect(status).toContainText("100% fit");

  await tree.getByRole("treeitem", { name: "hello.go" }).click();
  await expect(page.locator(".cm-content")).toContainText("func hello");
  await expect(status).toContainText("1:1");
});
