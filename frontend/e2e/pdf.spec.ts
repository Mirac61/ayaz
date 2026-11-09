import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { e2eWorkspace } from "../playwright.config";

const measure = (page: import("@playwright/test").Page, name: string) =>
  page.evaluate((n) => performance.getEntriesByName(n).at(-1)?.duration ?? null, name);

// M11 done-when: a 200-page PDF opens within budget and is searched and paged by keyboard (K6, K7 logged).
test("pdf: open, page, search", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "big.pdf" }).click();
  const status = page.locator(".statusline");
  await expect(status).toContainText("page 1/200");
  await expect.poll(() => measure(page, "pdf:first-page")).not.toBeNull();
  console.log(`K6 first page: ${Math.round((await measure(page, "pdf:first-page"))!)} ms`);

  await page.keyboard.press("J");
  await expect(status).toContainText("page 2/200");
  await page.keyboard.press("G");
  await expect(status).toContainText("page 200/200");
  await page.keyboard.type("gg");
  await expect(status).toContainText("page 1/200");

  await page.keyboard.press("/");
  await expect(page.getByRole("textbox", { name: "Search in PDF" })).toBeFocused();
  await page.keyboard.type("zanzibar");
  await page.keyboard.press("Enter");
  await expect(status).toContainText("1/1 matches", { timeout: 10_000 });
  await expect(status).toContainText("page 150/200");
  console.log(`K7 search: ${Math.round((await measure(page, "pdf:find"))!)} ms`);

  await page.keyboard.press("/");
  await page.keyboard.type("nothinglikethis");
  await page.keyboard.press("Enter");
  await expect(status).toContainText('no match for "nothinglikethis"', { timeout: 10_000 });
});

// A PDF changed on disk reloads in place, on the same page and zoom.
test("pdf: reload on change keeps page and zoom", async ({ page }) => {
  const file = join(e2eWorkspace, "reload.pdf");
  const pdf = readFileSync(join(e2eWorkspace, "big.pdf"), "latin1");
  writeFileSync(file, pdf, "latin1");
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "reload.pdf" }).click();
  const where = page.locator(".statusline .location");
  await expect(where).toContainText("page 1/200");
  await page.keyboard.press("/");
  await page.keyboard.type("zanzibar");
  await page.keyboard.press("Enter");
  await expect(where).toContainText("page 150/200", { timeout: 10_000 });
  const zoom = async () => (await where.textContent())?.match(/\d+%/)?.[0];
  const before = await zoom();
  await page.keyboard.press("+");
  await expect.poll(zoom).not.toBe(before);
  const zoomed = await zoom();

  writeFileSync(file, pdf.replace("zanzibar", "zebrafly"), "latin1"); // same length, so the xref offsets stay valid
  await expect(page.locator(".pdf-viewer")).toContainText("zebrafly");
  await expect(where).toContainText("page 150/200");
  expect(await zoom()).toBe(zoomed);
});

// Page canvases are drawn by the render worker (S8), and closing the PDF stops it.
test("pdf: pages come from the render worker", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "big.pdf" }).click();
  const status = page.locator(".statusline");
  await expect(status).toContainText("page 1/200");
  await page.keyboard.press("G");
  await expect(status).toContainText("page 200/200");
  await page.keyboard.type("gg");
  await expect(status).toContainText("page 1/200");
  const renders = () => page.evaluate(() => performance.getEntriesByName("pdf:worker-render").length);
  await expect.poll(renders).toBeGreaterThan(0);
  const dark = () => page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('.page[data-page-number="1"] canvas');
    if (!c?.width) return 0;
    const px = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] < 100) n++;
    return n;
  });
  await expect.poll(dark).toBeGreaterThan(1000);

  for (let i = 0; i < 5; i++) await page.keyboard.press("J");
  await page.keyboard.press("F1");
  await page.keyboard.type("close tab");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pdf-viewer")).toHaveCount(0);
  const after = await renders();
  await page.waitForTimeout(500);
  expect(await renders()).toBe(after);
  expect(errors).toEqual([]);
});
