import { describe, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { history, isolateHistory, undoDepth } from "@codemirror/commands";
import type { Buffer } from "../core/buffers";
import { UndoSteps } from "./undoSteps";

const buf = {} as Buffer;

// One edit in a pane (isolated, or CM6 would merge it into the last step): the transaction, and the depth before it, like Editors.dispatch sees them.
function edit(steps: UndoSteps, id: number, state: EditorState, event?: string) {
  const tr = state.update({ changes: { from: 0, insert: "x" }, userEvent: event, annotations: isolateHistory.of("before") });
  steps.track(id, buf, [tr], undoDepth(state), tr.state);
  return tr.state;
}

describe("UndoSteps", () => {
  const fresh = () => EditorState.create({ doc: "", extensions: [history()] });

  test("the latest edit's pane owns undo; redo has none yet", () => {
    const s = new UndoSteps();
    let st = edit(s, 1, fresh());
    st = edit(s, 2, st);
    expect(s.owner(buf, false)).toBe(2);
    expect(s.owner(buf, true)).toBeUndefined();
  });

  test("undo moves the step to redo, a new edit clears redo", () => {
    const s = new UndoSteps();
    const st = edit(s, 1, fresh());
    edit(s, 1, st, "undo");
    expect(s.owner(buf, false)).toBeUndefined();
    expect(s.owner(buf, true)).toBe(1);
    edit(s, 2, fresh());
    expect(s.owner(buf, true)).toBeUndefined();
  });

  test("forget drops a pane's steps", () => {
    const s = new UndoSteps();
    edit(s, 1, fresh());
    s.forget(1, buf);
    expect(s.owner(buf, false)).toBeUndefined();
  });
});
