import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView, GutterMarker, drawSelection, gutter, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, keymap,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, codeFolding, indentOnInput, indentUnit } from "@codemirror/language";
import { search } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { vim } from "@replit/codemirror-vim";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { kanagawaCM } from "../theme/kanagawa-cm";
import { extOf, loadLanguage } from "../lang/registry";
import { mdImages, mdlive } from "./mdlive";
import { lspExtension } from "./lsp";
import { gitGutter } from "./gitgutter";
import { fileSettings } from "../core/settings";

class Num extends GutterMarker {
  constructor(readonly text: string) { super(); }
  eq(o: Num) { return o.text === this.text; }
  toDOM() { return document.createTextNode(this.text); }
}

// nvim's `number relativenumber`: absolute on the cursor line, distance everywhere else.
const hybridLineNumbers = gutter({
  class: "cm-lineNumbers",
  lineMarker(view, block) {
    const doc = view.state.doc;
    const cur = doc.lineAt(view.state.selection.main.head).number;
    const n = doc.lineAt(block.from).number;
    return new Num(String(n === cur ? n : Math.abs(n - cur)));
  },
  lineMarkerChange: (u) => u.selectionSet || u.docChanged,
  initialSpacer: (view) => new Num(String(view.state.doc.lines)),
  updateSpacer: (_, u) => new Num(String(u.state.doc.lines)),
});

// vim() goes first so its keymap wins over the defaults.
export const editorExtensions = (): Extension[] => [
  vim(),
  EditorState.allowMultipleSelections.of(true), // vim's block mode is built on multiple selections
  hybridLineNumbers,
  gitGutter,
  highlightActiveLineGutter(),
  highlightActiveLine(),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  codeFolding(),
  bracketMatching(),
  // Like snacks.indent: a thin line per level, the block around the cursor a bit brighter.
  indentationMarkers({
    markerType: "codeOnly",
    colors: { dark: "#2c2c2e", light: "#2c2c2e", activeDark: "#6e6e73", activeLight: "#6e6e73" },
  }),
  indentOnInput(),
  closeBrackets(),
  search(),
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
  kanagawaCM,
];

// Line wrap, like nvim's `wrap`: from settings.json (off for code, on for Markdown), until <Space>uw sets it for every file.
const wrapping = new Compartment();
const WRAP_KEY = "ayaz.wrap";
export function wrapFor(path: string | null): boolean {
  try {
    const v = localStorage.getItem(WRAP_KEY);
    if (v === "on" || v === "off") return v === "on";
  } catch { /* storage blocked: the default */ }
  return fileSettings(path).wrap;
}
export const isWrapped = (s: EditorState) => wrapping.get(s) === EditorView.lineWrapping;
export function setWrap(on: boolean) {
  try { localStorage.setItem(WRAP_KEY, on ? "on" : "off"); } catch { /* a convenience */ }
  return wrapping.reconfigure(on ? EditorView.lineWrapping : []);
}

// Tab width and indent unit from settings.json, in a compartment so a saved settings.json applies to open files.
const indenting = new Compartment();
function indentFor(path: string | null): Extension {
  const cfg = fileSettings(path);
  return [EditorState.tabSize.of(cfg.tabWidth), indentUnit.of(cfg.tabs ? "\t" : " ".repeat(cfg.tabWidth))];
}
export const settingsEffects = (path: string | null) => [
  indenting.reconfigure(indentFor(path)),
  wrapping.reconfigure(wrapFor(path) ? EditorView.lineWrapping : []),
];

// Builds the state for a file, with its language loaded first so highlighting is there on the first frame.
export async function createState(path: string | null, doc: string, ws?: string, root?: string): Promise<EditorState> {
  const lang = path ? await loadLanguage(path) : null;
  return EditorState.create({ doc, extensions: [editorExtensions(), indenting.of(indentFor(path)), wrapping.of(wrapFor(path) ? EditorView.lineWrapping : []), lang ?? [], path && ws && root ? lspExtension(ws, root, path) : [], path?.startsWith("/") ? EditorState.readOnly.of(true) : [], path && extOf(path) === "md" ? [mdlive, ws ? mdImages.of({ ws, file: path }) : []] : []] });
}
