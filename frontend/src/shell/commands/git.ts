// Git in the buffer: hunks in the gutter and the diff against HEAD.
import type { Command } from "../../core/commands";
import { moveHunk, previewHunk, resetHunk } from "../../editor/gitgutter";
import { onView, type Ctx } from "./context";

export function gitCommands(c: Ctx): Command[] {
  return [
    { id: "git.nextHunk", title: "Next git hunk (]c)", run: () => onView(c, (v) => moveHunk(v, 1), "No git changes in this file") },
    { id: "git.prevHunk", title: "Previous git hunk ([c)", run: () => onView(c, (v) => moveHunk(v, -1), "No git changes in this file") },
    { id: "git.previewHunk", title: "Preview git hunk", run: () => onView(c, previewHunk, "No git change on this line") },
    { id: "git.resetHunk", title: "Reset git hunk", run: () => onView(c, resetHunk, "No git change on this line") },
    {
      id: "git.diff",
      title: "Toggle diff against HEAD",
      run: () => { if (!c.ed.toggleDiff()) c.fail("This file has no version at HEAD to compare with"); },
    },
  ];
}
