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
      id: "git.toggleInlineBlame",
      title: "Toggle inline ghost blame (<Space>ub)",
      run: () => {
        const on = c.ed.toggleAutoBlame();
        c.say(on ? "Inline ghost blame on" : "Inline ghost blame off");
      },
    },
    {
      id: "git.diff",
      title: "Toggle diff against HEAD (<Space>gd)",
      run: () => { if (!c.ed.toggleDiff()) c.fail("This file has no version at HEAD to compare with"); },
    },
    {
      id: "git.stageFile",
      title: "Stage active file (<Space>ga)",
      run: async () => {
        const buf = c.ed.current();
        if (!buf || buf.path.startsWith("/")) return c.fail("No file open");
        try {
          await c.files.gitStageFile(buf.path);
          c.ed.gitChanged();
          c.say(`Staged ${buf.path}`);
        } catch (e) {
          c.fail(errText(e));
        }
      },
    },
    {
      id: "git.unstageFile",
      title: "Unstage active file (<Space>gu)",
      run: async () => {
        const buf = c.ed.current();
        if (!buf || buf.path.startsWith("/")) return c.fail("No file open");
        try {
          await c.files.gitUnstageFile(buf.path);
          c.ed.gitChanged();
          c.say(`Unstaged ${buf.path}`);
        } catch (e) {
          c.fail(errText(e));
        }
      },
    },
    {
      id: "git.discardFile",
      title: "Discard changes in active file",
      run: async () => {
        const buf = c.ed.current();
        if (!buf || buf.path.startsWith("/")) return c.fail("No file open");
        try {
          await c.files.gitDiscardFile(buf.path);
          c.ed.gitChanged();
          c.say(`Discarded changes in ${buf.path}`);
        } catch (e) {
          c.fail(errText(e));
        }
      },
    },
    {
      id: "git.stageAll",
      title: "Stage all changes (<Space>gA)",
      run: async () => {
        try {
          await c.files.gitStageAll();
          c.ed.gitChanged();
          c.say("Staged all changes");
        } catch (e) {
          c.fail(errText(e));
        }
      },
    },
    {
      id: "git.unstageAll",
      title: "Unstage all changes (<Space>gU)",
      run: async () => {
        try {
          await c.files.gitUnstageAll();
          c.ed.gitChanged();
          c.say("Unstaged all changes");
        } catch (e) {
          c.fail(errText(e));
        }
      },
    },
    {
      id: "git.commit",
      title: "Git commit (<Space>gc, :Gcommit)",
      run: (arg) => {
        const doCommit = async (msg: string) => {
          const trimmed = msg.trim();
          if (!trimmed) return c.fail("Commit message cannot be empty");
          try {
            await c.files.gitCommit(trimmed);
            c.ed.gitChanged();
            c.say(`Committed: ${trimmed.split("\n")[0]}`);
          } catch (e) {
            c.fail(errText(e));
          }
        };
        const raw = arg?.trim();
        if (raw) {
          const msg = raw.startsWith("-m ") ? raw.slice(3).replace(/^["']|["']$/g, "") : raw;
          void doCommit(msg);
        } else {
          c.prompt("Git commit message", "", doCommit);
        }
      },
    },
    {
      id: "git.diffSplit",
      title: "Diff split against HEAD (<Space>gD, :Gvdiffsplit)",
      run: async () => {
        const buf = c.ed.current();
        if (!buf) return c.fail("No file open");
        const path = buf.path.startsWith("head://") ? buf.path.slice("head://".length) : buf.path;
        if (path.startsWith("/")) return c.fail("Cannot diff absolute paths");
        try {
          await c.ed.diffSplit(path);
        } catch (e) {
          c.fail(errText(e));
        }
      },
    },
  ];
}
