import { Vim, type CodeMirror } from "@replit/codemirror-vim";
import { foldAll, foldCode, toggleFold, unfoldAll, unfoldCode } from "@codemirror/language";
import { jumpToDefinition, jumpToImplementation, jumpToTypeDefinition } from "@codemirror/lsp-client";
import { parseKeys, type Binding } from "../../core/keymap";
import { installSurround } from "./surround";

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

let installed = false;

// codemirror-vim runs a full match at once, so for "<Space>t" next to "<Space>tc" it hands over to the
// workbench's Sequencer, which waits like Vim's timeoutlen.
export type Prime = (keys: string) => void;
let prime: Prime = () => {};

// normal: the "normal" bindings of the keymap; mapped once per app, so keymap.json changes need a restart.
export function installVim(r: Run, normal: Binding[], p: Prime) {
  run = r;
  prime = p;
  if (installed) return;
  installed = true;
  Vim.map("jk", "<Esc>", "insert");
  Vim.map(";", ":", "normal");
  for (const [name, prefix, command] of EX) Vim.defineEx(name, prefix, (_cm, p) => run(command, (p.argString ?? "").trim()));

  // Space is the leader, like most nvim setups; by default it is a synonym for l.
  Vim.unmap("<Space>", undefined as never);
  Vim.unmap("<C-w>", "normal"); // a no-op by default, and it would swallow <C-w>h etc.
  normal.forEach((b, i) => {
    const action = `ayaz${i}`;
    const isPrefix = normal.some((o) => o.keys !== b.keys && parseKeys(o.keys).join("").startsWith(parseKeys(b.keys).join("")));
    Vim.defineAction(action, () => (isPrefix ? prime(b.keys) : run(b.command, b.arg)));
    Vim.mapCommand(b.keys, "action", action, {}, { context: "normal" });
  });

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
}
