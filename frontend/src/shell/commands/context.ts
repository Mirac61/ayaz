// What the command modules share with the Workbench (ADR-0010): the workspace, its editors and the ways to talk to the user.
import type { EditorView } from "@codemirror/view";
import type { Files, Info } from "../../core/backend";
import type { Quickfix } from "../../core/quickfix";
import type { Editors } from "../editors";
import type { PickerSource } from "../Picker";
import type { TreeHandle } from "../Tree";

export interface Ctx {
  ws: Info;
  files: Files;
  ed: Editors;
  qf: Quickfix;
  tree: { current: TreeHandle | null };
  run(id: string, arg?: string): void;
  say(text: string): void;
  fail(text: string): void;
  setPicker(p: PickerSource | null): void;
  // A one-line prompt in the picker: the item is what was typed, Enter runs act with it.
  prompt(title: string, initial: string, act: (text: string) => Promise<unknown>): void;
  closePane(force: boolean, id?: number): Promise<unknown>;
}

export const LIMIT = 50;
export const SHOWN = 500; // project search hits listed in the picker; <C-q> takes all of them

// Wails rejects with an Error whose message is Go's error string.
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ":e! foo" → { force: true, rest: "foo" }
export const bang = (arg = "") => {
  const force = arg.startsWith("!");
  return { force, rest: (force ? arg.slice(1) : arg).trim() };
};

export const inTree = () => !!document.activeElement?.closest(".sidebar");

// Runs f on the active editor; fails with err when there is none or f finds nothing to do.
export const onView = ({ ed, fail }: Ctx, f: (v: EditorView) => boolean, err: string) => {
  const v = ed.activeView();
  if (!v || !f(v)) fail(err);
};
