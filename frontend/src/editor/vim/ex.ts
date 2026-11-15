import { Vim, type CodeMirror } from "@replit/codemirror-vim";
import { indentUnit } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";

// Ex commands codemirror-vim doesn't have (M63): :m (move lines), :t and :co (copy lines), :> and :< (shift lines).
// Ranges are the ones it parses for every command: `:2,4m0`, `:.,+1t$`, `:'<,'>>`.

// A destination line, 0-based, -1 for "above the first line" (:m0): a number, ".", "$", and "+N" / "-N" from the cursor.
export function parseAddress(arg: string, cursor: number, last: number): number | null {
  const m = /^\s*(\d+|\.|\$)?\s*(?:([+-])\s*(\d*))?\s*$/.exec(arg);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const base = m[1] === undefined || m[1] === "." ? cursor : m[1] === "$" ? last : Number(m[1]) - 1;
  const offset = m[2] ? (m[3] === "" ? 1 : Number(m[3])) * (m[2] === "-" ? -1 : 1) : 0;
  return base + offset;
}

// The lines of the range as [first, last], 0-based.
const range = (cm: CodeMirror, p: { line?: number; lineEnd?: number }): [number, number] => {
  const first = p.line ?? cm.getCursor().line;
  return [first, p.lineEnd ?? first];
};

function transfer(view: EditorView, [first, last]: [number, number], dest: number, copy: boolean) {
  const doc = view.state.doc, n = last - first + 1;
  const text = doc.sliceString(doc.line(first + 1).from, doc.line(last + 1).to);
  if (dest < -1 || dest >= doc.lines) throw new Error("Invalid address");
  if (!copy && dest >= first && dest < last) throw new Error("Cannot move a range of lines into itself");
  // Insert after line `dest`, or at the very start for :m0.
  const at = dest < 0 ? { from: 0, insert: text + "\n" } : { from: doc.line(dest + 1).to, insert: "\n" + text };
  const changes: { from: number; to?: number; insert?: string }[] = [at];
  if (!copy) {
    // The line break that goes with the lines: the one after them, or before them at the end of the file.
    const atEnd = last + 1 === doc.lines && first > 0;
    const lines = { from: doc.line(first + 1).from, to: Math.min(doc.line(last + 1).to + 1, doc.length) };
    changes.push(atEnd ? { from: doc.line(first).to, to: doc.line(last + 1).to } : lines);
  }
  view.dispatch({ changes, userEvent: copy ? "input.copy" : "move" });
  // The cursor lands on the last line of what was moved or copied, at its first non-blank.
  const newFirst = copy || dest < first ? dest + 1 : dest - n + 1;
  const line = view.state.doc.line(newFirst + n);
  view.dispatch({ selection: { anchor: line.from + /^\s*/.exec(line.text)![0].length } });
}

function shift(view: EditorView, [first, last]: [number, number], dir: 1 | -1) {
  const unit = view.state.facet(indentUnit), changes: { from: number; to?: number; insert?: string }[] = [];
  for (let n = first + 1; n <= last + 1; n++) {
    const line = view.state.doc.line(n);
    if (dir > 0) {
      if (line.text.trim()) changes.push({ from: line.from, insert: unit });
    } else {
      const lead = /^[ \t]*/.exec(line.text)![0];
      const tab = lead.startsWith("\t");
      const cut = lead.startsWith(unit) ? unit.length : tab ? 1 : Math.min(lead.length, unit.length);
      if (cut) changes.push({ from: line.from, to: line.from + cut });
    }
  }
  view.dispatch({ changes, userEvent: "input.indent" });
  const line = view.state.doc.line(last + 1); // the cursor goes to the last shifted line, at its first non-blank
  view.dispatch({ selection: { anchor: line.from + /^\s*/.exec(line.text)![0].length } });
}

export function installEx() {
  // codemirror-vim reads the command name as \w+, so ":m0" arrives as the name "m0" and an empty argument.
  const dest = (cm: CodeMirror, p: { argString?: string; commandName?: string }) => {
    const arg = p.argString?.trim() || (p.commandName ?? "").replace(/^[a-zA-Z]+/, "");
    const d = parseAddress(arg, cm.getCursor().line, cm.lastLine());
    if (d === null) throw new Error("Invalid address");
    return d;
  };
  // codemirror-vim runs "move" for a bare range too (":12" goes to line 12), so that case stays a jump.
  Vim.defineEx("move", "m", (cm: CodeMirror, p) => {
    if (p.commandName) return transfer(cm.cm6!, range(cm, p), dest(cm, p), false);
    const view = cm.cm6!, line = view.state.doc.line(Math.min(Math.max(p.line ?? 0, 0), view.state.doc.lines - 1) + 1);
    view.dispatch({ selection: { anchor: line.from + /^\s*/.exec(line.text)![0].length }, scrollIntoView: true });
  });
  const copy = (cm: CodeMirror, p: { line?: number; lineEnd?: number; argString?: string; commandName?: string }) =>
    transfer(cm.cm6!, range(cm, p), dest(cm, p), true);
  Vim.defineEx("copy", "co", copy);
  Vim.defineEx("t", "t", copy);
  // The command name is looked up as typed, so ":m0" needs a command called "m0": the one-digit destinations
  // are registered one by one (":m12" doesn't parse, ":m 12" does).
  for (let d = 0; d <= 9; d++) {
    Vim.defineEx(`m${d}`, `m${d}`, (cm: CodeMirror, p) => transfer(cm.cm6!, range(cm, p), dest(cm, p), false));
    Vim.defineEx(`t${d}`, `t${d}`, copy);
    Vim.defineEx(`co${d}`, `co${d}`, copy);
  }
  Vim.defineEx(">", ">", (cm: CodeMirror, p) => shift(cm.cm6!, range(cm, p), 1));
  Vim.defineEx("<", "<", (cm: CodeMirror, p) => shift(cm.cm6!, range(cm, p), -1));
}
