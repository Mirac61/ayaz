import { CodeMirror, Vim } from "@replit/codemirror-vim";
import { EditorView } from "@codemirror/view";
import { EditorSelection, type SelectionRange } from "@codemirror/state";
import { foldAll, foldCode, toggleFold, unfoldAll, unfoldCode } from "@codemirror/language";
import { jumpToDefinition, jumpToImplementation, jumpToTypeDefinition } from "@codemirror/lsp-client";
import { selectNextOccurrence } from "@codemirror/search";
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
  ["browse", "br", "browser.open"],
  ["cnext", "cn", "qf.next"],
  ["cprevious", "cp", "qf.prev"],
  ["copen", "cope", "qf.open"],
  ["Replace", "Rep", "qf.replace"],
  ["zen", "zen", "view.zen"],
  ["harpoon", "harpoon", "harpoon.menu"],
  ["Gwrite", "Gw", "git.stageFile"],
  ["Gread", "Gr", "git.discardFile"],
  ["Gcommit", "Gc", "git.commit"],
  ["Gvdiffsplit", "Gvd", "git.diffSplit"],
  ["Gdiffsplit", "Gd", "git.diffSplit"],
  ["checkupdate", "checkupdate", "ayaz.checkForUpdates"],
];

// Whether a palette line reads as a Vim ex command (":w", ":%s/a/b/", ":3,5d") rather than words to search commands by.
const EX_WORDS = new Set([
  ...EX.flatMap(([name, prefix]) => [name, prefix]),
  "x", "wa", "qa", "qall", "wqa", "xa", "s", "g", "v", "d", "y", "m", "t", "co", "noh", "nohlsearch", "set", "sort",
  "norm", "normal", "reg", "marks", "h", "help", "j", "join", "k", "pu", "put", "r", "read",
]);
export function isEx(q: string): boolean {
  if (/^[\d%.,$'<>+-]/.test(q) || /[!/]/.test(q)) return true;
  const [word, ...rest] = q.trim().split(/\s+/);
  // "split down" is a search for a command; "e file" and "set nu" are lines, so only short ex words take arguments.
  // User commands start uppercase (":Replace $2 $1") and always take arguments.
  return EX_WORDS.has(word) && (!rest.length || word.length <= 3 || /^[A-Z]/.test(word));
}

// ":" in normal mode opens the floating Noice-style cmdline; visual mode keeps Vim's line for '<,'>.
// Only the workbench asks for it: the Vim tests in the browser type ex lines into Vim's own line.
let paletteKey = false;
export function installPaletteKey() {
  if (paletteKey) return;
  paletteKey = true;
  Vim.defineAction("ayazCmdline", () => run("view.cmdline"));
  Vim.mapCommand(":", "action", "ayazCmdline", {}, { context: "normal" });
}

// u and <C-r> ask here first: the workbench runs them in the pane that made the buffer's latest change (M41).
// true: done there. Not set (tests, a single pane): Vim's own undo in this view.
export const historyRoute = new WeakMap<EditorView, (redo: boolean) => boolean>();

// Global marks mA-mZ across files (M63):
export interface GlobalMark {
  path: string;
  line: number; // 0-based
  ch: number;   // 0-based
}
export const globalMarks = new Map<string, GlobalMark>();
export const viewPath = new WeakMap<EditorView, () => string | undefined>();
export type MarkJump = (path: string, line: number, col: number) => void;
let markJump: MarkJump = () => {};
export function installMarkJump(mj: MarkJump) {
  markJump = mj;
}

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

  // Multi-cursor next occurrence: gb in normal and visual mode (like vscode-neovim / vim-visual-multi)
  Vim.defineAction("selectNextOccurrence", (cm: CodeMirror) => {
    if (cm.cm6) selectNextOccurrence(cm.cm6);
  });
  Vim.mapCommand("gb", "action", "selectNextOccurrence", {}, { context: "normal" });
  Vim.mapCommand("gb", "action", "selectNextOccurrence", {}, { context: "visual" });
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

  // Global cross-file marks mA-mZ (M63):
  for (let code = 65; code <= 90; code++) {
    const L = String.fromCharCode(code);
    Vim.defineAction("setMark_" + L, (cm: CodeMirror) => {
      const v = cm.cm6;
      if (!v) return;
      const path = viewPath.get(v)?.();
      const head = v.state.selection.main.head;
      const lineObj = v.state.doc.lineAt(head);
      const line = lineObj.number - 1;
      const ch = head - lineObj.from;
      if (path) globalMarks.set(L, { path, line, ch });
      const vim = (cm as unknown as { state?: { vim?: { marks?: Record<string, { clear(): void }> } } }).state?.vim;
      if (vim?.marks) {
        if (vim.marks[L]) vim.marks[L].clear();
        vim.marks[L] = (cm as unknown as { setBookmark(p: { line: number; ch: number }): { clear(): void } }).setBookmark({ line, ch });
      }
    });
    Vim.mapCommand("m" + L, "action", "setMark_" + L, {}, { context: "normal" });

    Vim.defineAction("jumpMarkLine_" + L, (cm: CodeMirror) => {
      const v = cm.cm6;
      if (!v) return;
      const currentPath = viewPath.get(v)?.();
      const mark = globalMarks.get(L);
      if (!mark) return;
      if (currentPath && mark.path !== currentPath) {
        markJump(mark.path, mark.line, 0);
        return;
      }
      const lineNo = Math.min(Math.max(mark.line + 1, 1), v.state.doc.lines);
      const lineObj = v.state.doc.line(lineNo);
      const firstNonWs = lineObj.text.search(/\S|$/);
      const pos = lineObj.from + Math.max(0, firstNonWs);
      v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    });
    Vim.mapCommand("'" + L, "action", "jumpMarkLine_" + L, {}, { context: "normal" });

    Vim.defineAction("jumpMarkChar_" + L, (cm: CodeMirror) => {
      const v = cm.cm6;
      if (!v) return;
      const currentPath = viewPath.get(v)?.();
      const mark = globalMarks.get(L);
      if (!mark) return;
      if (currentPath && mark.path !== currentPath) {
        markJump(mark.path, mark.line, mark.ch);
        return;
      }
      const lineNo = Math.min(Math.max(mark.line + 1, 1), v.state.doc.lines);
      const lineObj = v.state.doc.line(lineNo);
      const pos = Math.min(lineObj.from + mark.ch, lineObj.to);
      v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    });
    Vim.mapCommand("`" + L, "action", "jumpMarkChar_" + L, {}, { context: "normal" });
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
