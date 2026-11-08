import { Vim, type CodeMirror } from "@replit/codemirror-vim";
import { foldAll, foldCode, toggleFold, unfoldAll, unfoldCode } from "@codemirror/language";

// What the editor's Ex commands and leader keys do. The workbench provides it; vim's ex commands are global.
export interface VimHost {
  write(force: boolean): Promise<boolean>; // false if nothing was written (error shown)
  edit(path: string, force: boolean): Promise<void>;
  quit(force: boolean): Promise<void>;
  focusTree(): void;
}

let host: VimHost | null = null;

// ":e! foo" arrives as argString "! foo", ":w" as undefined.
const parse = (argString?: string) => {
  const s = (argString ?? "").trim();
  const force = s.startsWith("!");
  return { force, arg: (force ? s.slice(1) : s).trim() };
};

let installed = false;

export function installVim(h: VimHost) {
  host = h;
  if (installed) return;
  installed = true;
  Vim.map("jk", "<Esc>", "insert");
  Vim.defineEx("write", "w", (_cm, p) => void host?.write(parse(p.argString).force));
  Vim.defineEx("quit", "q", (_cm, p) => void host?.quit(parse(p.argString).force));
  Vim.defineEx("wq", "wq", async (_cm, p) => {
    const { force } = parse(p.argString);
    if (await host?.write(force)) await host?.quit(force);
  });
  Vim.defineEx("edit", "e", (_cm, p) => {
    const { force, arg } = parse(p.argString);
    void host?.edit(arg, force);
  });
  // Space is the leader, like most nvim setups; by default it is a synonym for l.
  Vim.unmap("<Space>", undefined as never);
  Vim.defineAction("focusTree", () => host?.focusTree());
  Vim.mapCommand("<Space>e", "action", "focusTree", {}, { context: "normal" });

  // codemirror-vim has no folds, CM6 does.
  const folds = { za: toggleFold, zc: foldCode, zo: unfoldCode, zM: foldAll, zR: unfoldAll };
  for (const [keys, cmd] of Object.entries(folds)) {
    Vim.defineAction(keys, (cm: CodeMirror) => void cmd(cm.cm6!));
    Vim.mapCommand(keys, "action", keys, {}, { context: "normal" });
  }
}
