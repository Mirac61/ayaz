// Git in the buffer: hunks in the gutter and the diff against HEAD.
import type { Command } from "../../core/commands";
import { blameText, showBlame } from "../../editor/blame";
import { moveConflict, resolveConflict, type Pick } from "../../editor/conflicts";
import { hunkPatch, moveHunk, previewHunk, resetHunk } from "../../editor/gitgutter";
import { isDirty } from "../../core/buffers";
import { errText, onView, type Ctx } from "./context";

export function gitCommands(c: Ctx): Command[] {
  const blame = async () => {
    const v = c.ed.activeView(), buf = c.ed.current();
    if (!v || !buf || buf.path.startsWith("/")) return;
    const line = v.state.doc.lineAt(v.state.selection.main.head).number;
    const info = await c.files.gitBlame(buf.path, line, isDirty(buf) ? v.state.doc.toString() : "");
    if (!info) return c.say("No git history for this file");
    showBlame(v, blameText(info));
  };

  // <Space>hs stages the hunk under the cursor (the buffer's text, saved or not), <Space>hu takes a staged one out.
  const stage = async (unstage: boolean) => {
    const v = c.ed.activeView(), buf = c.ed.current();
    if (!v || !buf || buf.path.startsWith("/")) return;
    const hunk = hunkPatch(v, unstage);
    if (!hunk) return c.say(unstage ? "No staged change on this line" : "No unstaged change on this line");
    await c.files.gitApplyHunk(buf.path, hunk, unstage);
    c.ed.gitChanged();
    c.say(unstage ? "Hunk unstaged" : "Hunk staged");
  };

  // Merge conflicts: take one side of the block under the cursor.
  const take = (pick: Pick) => () => onView(c, (v) => resolveConflict(v, pick), "The cursor is not in a merge conflict");
  const none = "No merge conflict in this file";

  return [
    { id: "git.nextHunk", title: "Next git hunk (]c)", run: () => onView(c, (v) => moveHunk(v, 1), "No git changes in this file") },
    { id: "git.prevHunk", title: "Previous git hunk ([c)", run: () => onView(c, (v) => moveHunk(v, -1), "No git changes in this file") },
    { id: "git.previewHunk", title: "Preview git hunk", run: () => onView(c, previewHunk, "No git change on this line") },
    { id: "git.resetHunk", title: "Reset git hunk", run: () => onView(c, resetHunk, "No git change on this line") },
    { id: "git.stageHunk", title: "Stage git hunk (<Space>hs)", run: () => stage(false).catch((e) => c.fail(errText(e))) },
    { id: "git.unstageHunk", title: "Unstage git hunk (<Space>hu)", run: () => stage(true).catch((e) => c.fail(errText(e))) },
    { id: "git.conflictOurs", title: "Merge conflict: take ours (<Space>mo)", run: take("ours") },
    { id: "git.conflictTheirs", title: "Merge conflict: take theirs (<Space>mt)", run: take("theirs") },
    { id: "git.conflictBoth", title: "Merge conflict: take both (<Space>mb)", run: take("both") },
    { id: "git.nextConflict", title: "Next merge conflict (]x)", run: () => onView(c, (v) => moveConflict(v, 1), none) },
    { id: "git.prevConflict", title: "Previous merge conflict ([x)", run: () => onView(c, (v) => moveConflict(v, -1), none) },
    { id: "git.blame", title: "Git blame of this line (<Space>gb)", run: () => blame().catch((e) => c.fail(errText(e))) },
    {
      id: "git.diff",
      title: "Toggle diff against HEAD",
      run: () => { if (!c.ed.toggleDiff()) c.fail("This file has no version at HEAD to compare with"); },
    },
  ];
}
