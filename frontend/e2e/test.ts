import { test as base } from "@playwright/test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { e2eCache } from "../playwright.config";

// The tests share one server and its swap folder: a test that ends with an unsaved buffer left a swap, and its
// "unsaved changes from last time" picker covered the next tests' pages. Each test starts without swaps.
export const test = base.extend<{ noSwaps: void }>({
  noSwaps: [async ({}, use) => {
    rmSync(join(e2eCache, "swap"), { recursive: true, force: true });
    await use();
  }, { auto: true }],
});

export { expect, type Locator, type Page } from "@playwright/test";
