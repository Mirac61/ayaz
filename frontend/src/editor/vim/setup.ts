import { CodeMirror, Vim } from "@replit/codemirror-vim";
import type { EditorView } from "@codemirror/view";
import { EditorSelection, type SelectionRange } from "@codemirror/state";
import { foldAll, foldCode, toggleFold, unfoldAll, unfoldCode } from "@codemirror/language";
import { jumpToDefinition, jumpToImplementation, jumpToTypeDefinition } from "@codemirror/lsp-client";
import { parseKeys, type Binding } from "../../core/keymap";
import { installSurround } from "./surround";
import { installEx } from "./ex";
import { installStructural } from "./structural";

// Runs a command by ID (core/commands). Vim's maps and ex commands are global, so the latest workbench's runner wins.
export type Run = (id: string, arg?: string) => void;
let run: Run = () => {};

// Ex commands are thin aliases for commands (ADR-0010); the arg is the rest of the line (":w!" → "!", ":e! a" → "! a").
const EX: [name: string, prefix: string, command: string][] = [
  ["write", "w", "file.save"],
  ["quit", "q", "pane.close"],
  ["wq", "wq", "file.saveClose"],
  ["edit", "e", "file.open"],
  ["split", "sp", "pane.splitDown"],
  ["vsplit", "vs", "pane.splitRight"],
  ["terminal", "ter", "term.split"],
  ["cnext", "cn", "qf.next"],
  ["cprevious", "cp", "qf.prev"],
  ["copen", "cope", "qf.open"],
  ["Replace", "Rep", "qf.replace"],
];

// u and <C-r> ask here first: the workbench runs them in the pane that made the buffer's latest change (M41).
// true: done there. Not set (tests, a single pane): Vim's own undo in this view.
export const historyRoute = new WeakMap<EditorView, (redo: boolean) => boolean>();

let installed = false;
let mapped: string[] = []; // keys of the bindings mapped last, unmapped before a new keymap goes in

// codemirror-vim runs a full match at once, so for "<Space>t" next to "<Space>tc" it hands over to the
// workbench's Sequencer, which waits like Vim's timeoutlen.
export type Prime = (keys: string) => void;
let prime: Prime = () => {};

// normal: the "normal" bindings of the keymap; a second call (keymap.json saved) replaces the earlier ones.
export function installVim(r: Run, normal: Binding[], p: Prime) {
  run = r;
  prime = p;
  if (installed) return mapBindings(normal);
  installed = true;
  Vim.map("jk", "<Esc>", "insert");
  Vim.map(";", ":", "normal");
  for (const [name, prefix, command] of EX) Vim.defineEx(name, prefix, (_cm, p) => run(command, (p.argString ?? "").trim()));

  // Space is the leader, like most nvim setups; by default it is a synonym for l.
  Vim.unmap("<Space>", undefined as never);
  Vim.unmap("<C-w>", "normal"); // a no-op by default, and it would swallow <C-w>h etc.
  mapBindings(normal);

  // Links under the cursor and tabs; editor-only, so the tree keeps its own g keys.
  for (const [keys, command] of Object.entries({ gx: "link.browser", gf: "link.file", gt: "tab.next", gT: "tab.prev" })) {
    Vim.defineAction(keys, () => run(command));
    Vim.mapCommand(keys, "action", keys, {}, { context: "normal" });
  }

  // LSP: gd, gI (implementation) and gy (type) are no-ops in files without a server; gr fills the quickfix list.
  const jumps = { gd: jumpToDefinition, gI: jumpToImplementation, gy: jumpToTypeDefinition };
  for (const [keys, cmd] of Object.entries(jumps)) {
    Vim.defineAction(keys, (cm: CodeMirror) => void cmd(cm.cm6!));
    Vim.mapCommand(keys, "action", keys, {}, { context: "normal" });
  }
  for (const [keys, command] of Object.entries({ gr: "lsp.references", K: "lsp.hover" })) {
    Vim.defineAction(keys, () => run(command));
    Vim.mapCommand(keys, "action", keys, {}, { context: "normal" });
  }

  // codemirror-vim has no folds, CM6 does.
  const folds = { za: toggleFold, zc: foldCode, zo: unfoldCode, zM: foldAll, zR: unfoldAll };
  for (const [keys, cmd] of Object.entries(folds)) {
    Vim.defineAction(keys, (cm: CodeMirror) => void cmd(cm.cm6!));
    Vim.mapCommand(keys, "action", keys, {}, { context: "normal" });
  }

  installSurround();
  installStructural();
  installEx();

  const plain = { undo: CodeMirror.commands.undo, redo: CodeMirror.commands.redo };
  CodeMirror.commands.undo = (cm: CodeMirror) => historyRoute.get(cm.cm6!)?.(false) || plain.undo(cm);
  CodeMirror.commands.redo = (cm: CodeMirror) => historyRoute.get(cm.cm6!)?.(true) || plain.redo(cm);

  // gj/gk through CM6: codemirror-vim reads a cursor at the start of a wrapped row as the end of the row above,
  // so gk from there didn't move. In normal mode the cursor is on the char, which is drawn at the row start (assoc 1).
  let lastScreen: SelectionRange | null = null; // keeps the goal column over gj/gk in a row
  Vim.defineMotion("screenLine", (cm, head, args) => {
    const view = cm.cm6!;
    const pos = cm.indexFromPos(head);
    let r = lastScreen?.head === pos ? lastScreen : EditorSelection.cursor(pos, 1);
    for (let i = 0; i < (args.repeat ?? 1); i++) r = view.moveVertically(r, !!args.forward);
    lastScreen = r;
    return cm.posFromIndex(r.head);
  });
  Vim.mapCommand("gj", "motion", "screenLine", { forward: true }, {});
  Vim.mapCommand("gk", "motion", "screenLine", { forward: false }, {});
}

function mapBindings(normal: Binding[]) {
  for (const keys of mapped) Vim.unmap(keys, "normal");
  mapped = normal.map((b) => b.keys);
  normal.forEach((b, i) => {
    const action = `ayaz${i}`;
    const isPrefix = normal.some((o) => o.keys !== b.keys && parseKeys(o.keys).join("").startsWith(parseKeys(b.keys).join("")));
    Vim.defineAction(action, () => (isPrefix ? prime(b.keys) : run(b.command, b.arg)));
    Vim.mapCommand(b.keys, "action", action, {}, { context: "normal" });
  });
}
