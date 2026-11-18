import { expect, test, type Page } from "./test";
import { e2eWorkspace } from "../playwright.config";
import { basename } from "node:path";

// The server build has no native window, so no Finder drops: the test sends Go's drop events in the page itself.
async function emit(page: Page, name: string, data: object) {
  await page.evaluate(
    ([name, data]) =>
      (window as unknown as { _wails: { dispatchWailsEvent(e: object): void } })._wails.dispatchWailsEvent({ name, data }),
    [name, data] as const,
  );
}

test("drop progress: two drops share the status line, each one's end removes only its own", async ({ page }) => {
  // The workspace ID is unguessable and not in the DOM: it comes from the binding call that opens the folder.
  let ws = "";
  page.on("response", async (r) => {
    if (r.url().endsWith("/wails/runtime") && r.ok()) {
      const info = await r.json().catch(() => null);
      if (typeof info?.id === "string" && info?.name === basename(e2eWorkspace)) {
        ws = info.id;
      }
    }
  });
  await page.goto("/");
  await expect(page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: "README.md" })).toBeVisible();
  await expect.poll(() => ws).not.toBe("");

  const copying = page.locator(".statusline [title^='Copying']");
  await emit(page, "app:drop-progress", { ws, id: 101, name: "a.iso", done: 100, total: 200 });
  await emit(page, "app:drop-progress", { ws, id: 102, name: "b.iso", done: 0, total: 600 });
  await expect(copying).toHaveText("⇣ Copying 12%");
  await expect(copying).toHaveAttribute("title", "Copying 2 drops: 12%");

  await emit(page, "app:dropped", { ws, id: 101, paths: null, errors: null });
  await expect(copying).toHaveAttribute("title", 'Copying "b.iso" into the folder: 0%');

  await emit(page, "app:dropped", { ws, id: 102, paths: null, errors: null });
  await expect(copying).toHaveCount(0);
});
