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

// M60: <Space>gb shows who changed the line, at its end; an edited line is "not committed"; moving clears it.
test("inline blame", async ({ page }) => {
  const file = "gitblame.txt";
  writeFileSync(join(e2eWorkspace, file), "one\ntwo\n");
  commit(file);
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: file }).click();
  await expect(page.locator(".cm-content")).toContainText("two");
  await page.locator(".cm-content").click();
  await page.keyboard.type("gg gb");
  await expect(page.locator(".cm-blame")).toContainText("e2e, ");
  await expect(page.locator(".cm-blame")).toContainText(file);
  await page.keyboard.type("j");
  await expect(page.locator(".cm-blame")).toHaveCount(0);
  await page.keyboard.type("AX");
  await page.keyboard.press("Escape");
  await page.keyboard.type(" gb");
  await expect(page.locator(".cm-blame")).toHaveText("Not committed yet");
});

// M61: <Space>hs stages the hunk under the cursor (only that one), the sign turns dim, <Space>hu takes it out again.
test("stage and unstage a hunk", async ({ page }) => {
  const file = "gitstage.txt";
  writeFileSync(join(e2eWorkspace, file), "one\ntwo\nthree\nfour\nfive\n");
  commit(file);
  const cached = () => execFileSync("git", ["-C", e2eWorkspace, "diff", "--cached", "-U0", "--", file]).toString();
  await page.goto("/");
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: file }).click();
  await expect(page.locator(".cm-content")).toContainText("five");
  await page.locator(".cm-content").click();
  await page.keyboard.type("ggAX"); // line 1
  await page.keyboard.press("Escape");
  await page.keyboard.type("5GAY"); // line 5 ("G" is the empty line after the last newline)
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-git-mod")).toHaveCount(2);

  await page.keyboard.type("gg hs");
  await expect(page.locator(".statusline")).toContainText("Hunk staged");
  await expect(page.locator(".cm-git-staged")).toHaveCount(1, { timeout: 5000 });
  expect(cached()).toContain("+oneX");
  expect(cached()).not.toContain("fiveY"); // the other hunk and the unsaved text stay out of it

  await page.keyboard.type(" hu");
  await expect(page.locator(".statusline")).toContainText("Hunk unstaged");
  await expect(page.locator(".cm-git-staged")).toHaveCount(0, { timeout: 5000 });
  expect(cached()).toBe("");
  await page.keyboard.type("5G hs"); // the second one, on its own
  await expect(page.locator(".cm-git-staged")).toHaveCount(1, { timeout: 5000 });
  expect(cached()).toContain("+fiveY");
  expect(cached()).not.toContain("oneX");
});

// M62: markers in a file are coloured, ]x jumps to the next conflict, <Space>mt / mo take a side.
test("merge conflict: colours, ]x, take theirs and ours", async ({ page }) => {
  const file = "conflict.txt";
  const block = (n: string) => `<<<<<<< HEAD\nours ${n}\n=======\ntheirs ${n}\n>>>>>>> feature\n`;
  writeFileSync(join(e2eWorkspace, file), `top\n${block("one")}mid\n${block("two")}end\n`);
  await page.goto("/");
  await page.keyboard.press("/");
  await page.keyboard.type(file);
  await page.getByRole("tree", { name: "Files" }).getByRole("treeitem", { name: file }).click();
  await expect(page.locator(".cm-content")).toContainText("theirs two");
  await expect(page.locator(".cm-conflict-marker")).toHaveCount(6);
  await page.locator(".cm-content").click();
  await page.keyboard.type("gg]x");
  await expect(page.locator(".statusline")).toContainText("2:1");
  await page.keyboard.type("]x");
  await expect(page.locator(".statusline")).toContainText("8:1");
  await page.keyboard.type("j mt"); // the second: theirs
  await expect(page.locator(".cm-content")).toContainText("theirs two");
  await expect(page.locator(".cm-content")).not.toContainText("ours two");
  await page.keyboard.type("gg]xj mo"); // the first: ours (the cursor sits inside it)
  await expect(page.locator(".cm-content")).not.toContainText("theirs one");
  await expect(page.locator(".cm-conflict-marker")).toHaveCount(0);
  await page.keyboard.type(":e!"); // nothing of this reaches the disk
  await page.keyboard.press("Enter");
});
