import { getCM, Vim, type CodeMirror } from "@replit/codemirror-vim";
import type { EditorView } from "@codemirror/view";
import { LSPPlugin } from "@codemirror/lsp-client";
import { functionStart, growRange, objectRange, type Kind, type Range } from "./structure";

// Structural text objects and motions (M55): af/if ac/ic aa/ia, ]f/[f, and + / - to grow and shrink a selection
// by syntax (or by what the language server says through textDocument/selectionRange).

const OBJECTS: [keys: string, kind: Kind][] = [["f", "function"], ["c", "class"], ["a", "argument"]];

interface Pos { line: number; character: number }
interface LspRange { range: { start: Pos; end: Pos }; parent?: LspRange }

// The next bigger selection: the server's chain if it has one, else the syntax tree's next node.
async function grown(view: EditorView, cur: Range): Promise<Range | null> {
  const plugin = LSPPlugin.get(view);
  if (plugin?.client.connected && plugin.client.serverCapabilities?.selectionRangeProvider) {
    const doc = view.state.doc;
    plugin.client.sync();
    const chain = await plugin.client.request<object, LspRange[] | null>("textDocument/selectionRange", {
      textDocument: { uri: plugin.uri }, positions: [plugin.toPosition(cur.from, doc)],
    }).catch(() => null);
    if (view.state.doc === doc) {
      for (let r = chain?.[0]; r; r = r.parent) {
        const from = plugin.fromPosition(r.range.start, doc), to = plugin.fromPosition(r.range.end, doc);
        if (from <= cur.from && to >= cur.to && (from < cur.from || to > cur.to)) return { from, to };
      }
    }
  }
  return growRange(view.state, cur.from, cur.to);
}

// What each view's selection was before each step of growing, and the selection the last step made.
const history = new WeakMap<EditorView, { steps: Range[]; last: Range }>();

// Out of visual mode first: Vim keeps its own selection and only follows the editor's when it starts from normal mode.
function select(view: EditorView, r: Range) {
  const cm = getCM(view);
  if (cm?.state.vim?.visualMode) Vim.exitVisualMode(cm as never); // getCM's type is wider than the Vim API's
  view.dispatch({ selection: { anchor: r.from, head: r.to }, scrollIntoView: true }); // that puts Vim in visual mode
}

async function expand(view: EditorView) {
  const { from, to } = view.state.selection.main;
  let h = history.get(view);
  if (!h || h.last.from !== from || h.last.to !== to) h = { steps: [], last: { from, to } };
  const next = await grown(view, { from, to });
  if (!next) return;
  h.steps.push({ from, to });
  h.last = next;
  history.set(view, h);
  select(view, next);
}

function shrink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const h = history.get(view);
  const back = h?.steps.pop();
  if (!h || !back || h.last.from !== from || h.last.to !== to) return;
  h.last = back;
  select(view, back);
}

export function installStructural() {
  // Text objects: the range comes from the syntax tree. In visual mode the head is the last character, so one before the end.
  Vim.defineMotion("structObject", (cm: CodeMirror, head, args, vim) => {
    const state = cm.cm6!.state;
    const kind = (args as unknown as { kind: Kind }).kind;
    const r = objectRange(state, cm.indexFromPos(head), kind, !!args.textObjectInner, args.repeat);
    if (!r) return null;
    return [cm.posFromIndex(r.from), cm.posFromIndex(vim.visualMode ? Math.max(r.from, r.to - 1) : r.to)];
  });
  for (const [key, kind] of OBJECTS) {
    for (const context of ["operatorPending", "visual"] as const) {
      Vim.mapCommand(`a${key}`, "motion", "structObject", { kind }, { context });
      Vim.mapCommand(`i${key}`, "motion", "structObject", { kind, textObjectInner: true }, { context });
    }
  }

  Vim.defineMotion("functionJump", (cm: CodeMirror, head, args) => {
    const at = functionStart(cm.cm6!.state, cm.indexFromPos(head), !!args.forward);
    return at === null ? null : cm.posFromIndex(at);
  });
  Vim.mapCommand("]f", "motion", "functionJump", { forward: true, toJumplist: true }, {});
  Vim.mapCommand("[f", "motion", "functionJump", { forward: false, toJumplist: true }, {});

  Vim.defineAction("expandSelection", (cm: CodeMirror) => void expand(cm.cm6!));
  Vim.defineAction("shrinkSelection", (cm: CodeMirror) => shrink(cm.cm6!));
  Vim.mapCommand("+", "action", "expandSelection", {}, { context: "normal" });
  Vim.mapCommand("+", "action", "expandSelection", {}, { context: "visual" });
  Vim.mapCommand("-", "action", "shrinkSelection", {}, { context: "visual" });
}
