import { expect, test } from "./test";
import { e2eWorkspace } from "../playwright.config";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// A .mmd file opens as a drawing in the image viewer; the toggle shows its text. (PlantUML needs the plantuml program: Go tests cover it.)
test("a Mermaid file opens as a diagram, the toggle shows the source", async ({ page }) => {
  const file = join(e2eWorkspace, "flow.mmd");
  writeFileSync(file, "graph TD\n  A[Start] --> B[End]\n");
  try {
    await page.goto("/");
    const tree = page.getByRole("tree", { name: "Files" });
    await tree.getByRole("treeitem", { name: "flow.mmd" }).dblclick();
    const img = page.locator(".image-viewer.diagram img");
    await expect(img).toHaveAttribute("src", /Start/);
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(50);
    await page.locator(".render-toggle").click();
    await expect(page.locator(".cm-content")).toContainText("graph TD");
  } finally {
    rmSync(file, { force: true });
  }
});
