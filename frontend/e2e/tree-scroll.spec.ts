import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { e2eWorkspace } from "../playwright.config";

const dir = join(e2eWorkspace, "zz-scroll");

// Fast scrolling in a long tree must never show an empty stretch: at every frame the rows cover the whole viewport.
test("tree: no blank rows while scrolling fast", async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 600; i++) writeFileSync(join(dir, `file-${String(i).padStart(3, "0")}.txt`), "");
  try {
    await page.goto("/");
    const tree = page.getByRole("tree", { name: "Files" });
    await expect(tree).toBeFocused();
    await tree.getByRole("treeitem", { name: "zz-scroll" }).click();
    await expect(tree.getByRole("treeitem", { name: "file-000.txt" })).toBeVisible();

    const gaps = await tree.evaluate(async (box) => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const max = box.scrollHeight - box.clientHeight;
      let bad = 0, dir = 1;
      box.scrollTop = max / 2;
      await frame();
      for (let i = 0; i < 120; i++) {
        if (i % 20 === 0) dir = -dir; // a hard flick, then back the other way
        box.scrollTop = Math.min(max, Math.max(0, box.scrollTop + dir * 300)); // about 10 rows per frame
        await frame();
        const tops = [...box.querySelectorAll<HTMLElement>(".tree-row")].map((r) => parseFloat(r.style.top));
        if (!tops.length || Math.min(...tops) > box.scrollTop || Math.max(...tops) + 28 < box.scrollTop + box.clientHeight) bad++;
      }
      return bad;
    });
    expect(gaps).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
