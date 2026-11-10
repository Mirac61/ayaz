import { Vim, type CodeMirror } from "@replit/codemirror-vim";
import type { EditorView } from "@codemirror/view";

// Like nvim-surround: ys{motion}{char}, yss{char}, cs{old}{new}, ds{char}, S{char} in visual mode.
// An opening bracket adds spaces inside ("( x )"), a closing one doesn't ("(x)"); b and B are ( and {.
const PAIRS: Record<string, [string, string]> = { "(": ["(", ")"], "[": ["[", "]"], "{": ["{", "}"], "<": ["<", ">"] };
const CLOSE: Record<string, string> = { ")": "(", "]": "[", "}": "{", ">": "<", b: "(", B: "{" };

// The text to put around a selection for char; null for a key that isn't a surround char.
export function wrapWith(char: string): [string, string] | null {
  if (PAIRS[char]) return [PAIRS[char][0] + " ", " " + PAIRS[char][1]];
  if (CLOSE[char]) return PAIRS[CLOSE[char]];
  return char.length === 1 && /[^\w\s]/.test(char) ? [char, char] : null;
}

// Positions of the open and close char of the pair around pos, or null. Quotes are searched on the line only.
export function findPair(text: string, pos: number, char: string): [number, number] | null {
  const open = CLOSE[char] ?? (PAIRS[char] ? char : null);
  if (!open) {
    const start = text.lastIndexOf("\n", pos - 1) + 1;
    const end = text.indexOf("\n", pos) < 0 ? text.length : text.indexOf("\n", pos);
    const line = text.slice(start, end);
    const at = pos - start;
    // On a quote: the pair it opens if an even number of quotes precede it, else the one it closes.
    const before = line.slice(0, at).split(char).length - 1;
    const from = line[at] === char && before % 2 === 0 ? at : line.lastIndexOf(char, at - 1);
    const to = from < 0 ? -1 : line.indexOf(char, Math.max(from + 1, at));
    return from < 0 || to < 0 ? null : [start + from, start + to];
  }
  const close = PAIRS[open][1];
  let from = -1;
  for (let i = text[pos] === close ? pos - 1 : pos, depth = 0; i >= 0; i--) {
    if (text[i] === close) depth++;
    else if (text[i] === open && depth-- === 0) { from = i; break; }
  }
  if (from < 0) return null;
  for (let i = from + 1, depth = 0; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && depth-- === 0) return [from, i];
  }
  return null;
}

function wrap(view: EditorView, from: number, to: number, char: string) {
  const w = wrapWith(char);
  if (!w) return;
  view.dispatch({ changes: [{ from, insert: w[0] }, { from: to, insert: w[1] }], selection: { anchor: from }, userEvent: "input" });
}

// Replaces the pair around the cursor; with no new char it removes it, and the spaces an opening bracket put inside.
function change(view: EditorView, old: string, char: string | null) {
  const text = view.state.doc.toString();
  const p = findPair(text, view.state.selection.main.head, old);
  const w = char === null ? ["", ""] : wrapWith(char);
  if (!p || !w) return;
  let [from, to] = p;
  let fromEnd = from + 1, toStart = to;
  if (PAIRS[old] && text[fromEnd] === " " && text[toStart - 1] === " " && fromEnd < toStart - 1) { fromEnd++; toStart--; }
  view.dispatch({ changes: [{ from, to: fromEnd, insert: w[0] }, { from: toStart, to: to + 1, insert: w[1] }], selection: { anchor: from }, userEvent: "input" });
}

// The chars after ds, cs and ys{motion}: Vim's keymap has no such commands, so the next key press is read here.
function nextKey(view: EditorView, then: (key: string) => void) {
  const on = (e: KeyboardEvent) => {
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    view.contentDOM.removeEventListener("keydown", on, true);
    if (e.key.length === 1) then(e.key);
  };
  view.contentDOM.addEventListener("keydown", on, true);
}

// shortcut: no dot-repeat for ds/cs/ys, since the chars are read outside Vim; upgrade if it gets missed.
export function installSurround() {
  // d, c and y are complete operators, so codemirror-vim runs them before an "s" could follow. Like nvim-surround,
  // "s" is an operator-pending map instead: it cancels the operator and does the surround the operator stood for.
  Vim.defineMotion("surroundPending", (cm, _head, _args, vim, input) => {
    const view = cm.cm6!;
    if (input.operator === "delete") nextKey(view, (old) => change(view, old, null));
    else if (input.operator === "change") nextKey(view, (old) => nextKey(view, (c) => change(view, old, c)));
    else if (input.operator === "yank") Object.assign(vim.inputState, { operator: "surround", operatorArgs: {}, operatorShortcut: "ys" });
    return null;
  });
  Vim.mapCommand("s", "motion", "surroundPending", {}, { context: "operatorPending" });
  Vim.mapCommand("ys", "operator", "surround", {}, { context: "operatorPending" }); // yss: the line

  Vim.defineOperator("surround", (cm: CodeMirror, _args, ranges) => {
    const view = cm.cm6!;
    const r = ranges[0];
    let [from, to] = [cm.indexFromPos(r.anchor), cm.indexFromPos(r.head)].sort((a, b) => a - b);
    // yss and linewise motions wrap the text of the lines, not their line breaks and indent.
    const s = view.state.sliceDoc(from, to);
    from += s.length - s.trimStart().length;
    to -= s.length - s.trimEnd().length;
    nextKey(view, (k) => wrap(view, from, to, k));
  });

  Vim.defineAction("surroundVisual", (cm, args) => {
    const view = cm.cm6!;
    const { from, to } = view.state.selection.main;
    Vim.exitVisualMode(cm);
    wrap(view, from, to, args.selectedCharacter ?? "");
  });
  Vim.unmap("S", "visual"); // by default VdO, a new line for the selected ones; c does nearly that
  Vim.mapCommand("S<character>", "action", "surroundVisual", {}, { context: "visual" });
}
