import { expect, test } from "@playwright/test";

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
