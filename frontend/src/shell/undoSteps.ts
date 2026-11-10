import type { EditorState, Transaction } from "@codemirror/state";
import { undoDepth } from "@codemirror/commands";
import type { Buffer } from "../core/buffers";

// Per buffer: the pane behind each undo (and redo) step, newest last. Each pane keeps its own CM6 history,
// so u runs in the pane that made the latest step, and the change syncs to the others (like nvim's one undo tree).
export class UndoSteps {
  private steps = new WeakMap<Buffer, { undo: number[]; redo: number[] }>();

  // The pane that made the latest undo (or redo) step of b.
  owner(b: Buffer, redoing: boolean): number | undefined {
    const s = this.steps.get(b);
    const list = redoing ? s?.redo : s?.undo;
    return list?.[list.length - 1];
  }

  forget(id: number, b: Buffer) {
    const s = this.steps.get(b);
    if (s) for (const l of [s.undo, s.redo]) l.splice(0, l.length, ...l.filter((x) => x !== id));
  }

  // An edit adds a step for pane id (CM6 may merge it into the last one: then the depth stays), undo and redo move one.
  track(id: number, b: Buffer, trs: readonly Transaction[], depth: number, state: EditorState) {
    let s = this.steps.get(b);
    if (!s) this.steps.set(b, (s = { undo: [], redo: [] }));
    const move = (from: number[], to: number[]) => {
      const i = from.lastIndexOf(id);
      if (i >= 0) from.splice(i, 1);
      to.push(id);
    };
    if (trs.some((t) => t.isUserEvent("undo"))) move(s.undo, s.redo);
    else if (trs.some((t) => t.isUserEvent("redo"))) move(s.redo, s.undo);
    else if (undoDepth(state) > depth) {
      s.undo.push(id);
      s.redo.length = 0;
    }
  }
}
