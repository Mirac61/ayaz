import { EditorState, type Extension } from "@codemirror/state";
import {
  GutterMarker, drawSelection, gutter, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, keymap,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, codeFolding, indentOnInput } from "@codemirror/language";
import { search } from "@codemirror/search";
import { vim } from "@replit/codemirror-vim";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { kanagawaCM } from "../theme/kanagawa-cm";
import { extOf, loadLanguage } from "../lang/registry";
import { mdImages, mdlive } from "./mdlive";
import { lspExtension } from "./lsp";
import { gitGutter } from "./gitgutter";

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
  search(),
  keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  kanagawaCM,
];

// Builds the state for a file, with its language loaded first so highlighting is there on the first frame.
export async function createState(path: string | null, doc: string, ws?: string, root?: string): Promise<EditorState> {
  const lang = path ? await loadLanguage(path) : null;
  return EditorState.create({ doc, extensions: [editorExtensions(), lang ?? [], path && ws && root ? lspExtension(ws, root, path) : [], path?.startsWith("/") ? EditorState.readOnly.of(true) : [], path && extOf(path) === "md" ? [mdlive, ws ? mdImages.of({ ws, file: path }) : []] : []] });
}
