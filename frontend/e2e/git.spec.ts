import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { e2eWorkspace } from "../playwright.config";

// Commits only this file: other tests run in parallel and change theirs.
const commit = (file: string) => {
  const git = (...a: string[]) => execFileSync("git", ["-C", e2eWorkspace, "-c", "user.name=e2e", "-c", "user.email=e2e@ayaz", ...a]);
  git("add", file);
  git("commit", "-q", "-m", file, "--", file);
};

// M19: signs for changed lines, ]c, reset, the branch, and a commit from outside clears the signs (Go's poll).
test("git gutter, hunk keys, branch and a commit from outside", async ({ page }) => {
  const file = "gitgutter.txt";
  writeFileSync(join(e2eWorkspace, file), "one\ntwo\nthree\nfour\n");
  commit(file);
  await page.goto("/");
  const status = page.locator(".statusline");
  await expect(status.locator(".branch")).toContainText("main");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: file }).click();
  await expect(page.locator(".cm-content")).toContainText("four");

  await page.keyboard.type("jjAX"); // line 3
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-git-mod")).toHaveCount(1);
  await page.keyboard.type("gg]c");
  await expect(status).toContainText("3:1");
  await page.keyboard.type(" hp");
  await expect(page.locator(".cm-git-preview")).toContainText("-three");
  await page.keyboard.type(" hr");
  await expect(page.locator(".cm-git-mod")).toHaveCount(0);
  await expect(status.locator(".dirty")).toHaveCount(0);

  writeFileSync(join(e2eWorkspace, file), "one\ntwo\nthree\nfour\nfive\n"); // the clean buffer reloads
  await expect(page.locator(".cm-git-add")).toHaveCount(1);
  commit(file);
  await expect(page.locator(".cm-git-add")).toHaveCount(0, { timeout: 5000 });
});

// M29: the tree colors new and changed files and follows a commit from outside.
test("git status colors the tree", async ({ page }) => {
  const file = "gittree.txt";
  writeFileSync(join(e2eWorkspace, file), "one\n");
  await page.goto("/");
  const name = page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: file }).locator(".tree-name");
  await expect(name).toHaveClass(/git-add/);
  commit(file);
  await expect(name).not.toHaveClass(/git-/, { timeout: 5000 }); // Go polls the index once a second
  writeFileSync(join(e2eWorkspace, file), "two\n");
  await expect(name).toHaveClass(/git-mod/);
});

// M30: <Space>gd shows the HEAD text of changed lines inline and toggles off.
test("diff against HEAD", async ({ page }) => {
  const file = "gitdiff.txt";
  writeFileSync(join(e2eWorkspace, file), "red\ngreen\nblue\n"); // not search.spec's words: it counts matches
  commit(file);
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: file }).click();
  await expect(page.locator(".cm-content")).toContainText("blue");
  await page.keyboard.type("jciwGREEN");
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-git-mod")).toHaveCount(1);
  await page.keyboard.type(" gd");
  await expect(page.locator(".cm-deletedChunk")).toContainText("green");
  await page.keyboard.type(" gd");
  await expect(page.locator(".cm-deletedChunk")).toHaveCount(0);
});
