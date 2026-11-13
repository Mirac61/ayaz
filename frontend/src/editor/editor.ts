import { Compartment, EditorState, type Extension, type Text } from "@codemirror/state";
import {
  EditorView, GutterMarker, drawSelection, gutter, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, keymap,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, codeFolding, indentOnInput, indentUnit } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { vim } from "@replit/codemirror-vim";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { cmTheme } from "../theme/cm-theme";
import { inlineBlame } from "./blame";
import { breakpointGutter } from "./breakpoints";
import { conflictMarks } from "./conflicts";
import { debugLine } from "./debugline";
import { snippetCompletion } from "./snippets";
import { stickyScroll } from "./sticky";
import { extOf, loadLanguage } from "../lang/registry";
import { mdImages, mdlive } from "./mdlive";
import { pasteImage } from "./pasteImage";
import { mdRender } from "./mdrender";
import { lspExtension } from "./lsp";
import { gitGutter } from "./gitgutter";
import { swatches } from "./swatches";
import { diagnosticText } from "./diagtext";
import { editorConfigIndent } from "../core/editorconfig";
import { detectIndent, INDENT_SAMPLE } from "../core/indent";
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
  breakpointGutter,
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
  keymap.of([...closeBracketsKeymap, ...searchKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
  cmTheme,
  stickyScroll,
  inlineBlame,
  conflictMarks,
  debugLine,
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
// .editorconfig wins, then the file's own indentation (core/indent.ts), then settings.json.
function indentFor(path: string | null, sample = ""): Extension {
  const cfg = fileSettings(path), ec = editorConfigIndent(path), found = detectIndent(sample);
  const tabs = ec.tabs ?? (found ? found.tabs : cfg.tabs);
  const width = ec.size ?? (found && !found.tabs ? found.width : cfg.tabWidth);
  return [EditorState.tabSize.of(ec.tabWidth ?? (tabs ? cfg.tabWidth : width)), indentUnit.of(tabs ? "\t" : " ".repeat(width))];
}
export const settingsEffects = (path: string | null, doc?: Text) => [
  indenting.reconfigure(indentFor(path, doc?.sliceString(0, INDENT_SAMPLE))),
  wrapping.reconfigure(wrapFor(path) ? EditorView.lineWrapping : []),
];

// Builds the state for a file, with its language loaded first so highlighting is there on the first frame.
// M51: from a line of ~32 KB on, highlighting costs 15–25 ms per key (16 KB: 6 ms). Such files (minified code,
// one-line JSON) open as plain text; the file size alone (10 MB: 3 ms per key) is no reason.
export const LONG_LINE = 20_000;
export function hasLongLine(doc: string): boolean {
  for (let at = 0; at < doc.length;) {
    const nl = doc.indexOf("\n", at);
    if ((nl < 0 ? doc.length : nl) - at > LONG_LINE) return true;
    if (nl < 0) break;
    at = nl + 1;
  }
  return false;
}

// Files written as text: the webview underlines misspelled words (code stays quiet).
const PROSE = new Set(["md", "txt", "typ", "tex"]);
const SWATCHED = new Set(["css", "html", "js", "mjs", "jsx", "ts", "tsx", "json"]); // where hex colors get a swatch
export const isProse = (path: string) => PROSE.has(extOf(path));

export const spellchecking = new Compartment();
export const spellcheckAttr = EditorView.contentAttributes.of({ spellcheck: "true" });
export const noSpellcheckAttr = EditorView.contentAttributes.of({ spellcheck: "false" });
export const spellcheckFor = (path: string | null) => !!(path && PROSE.has(extOf(path)));

export async function createState(path: string | null, doc: string, ws?: string, root?: string): Promise<EditorState> {
  const lang = path && !hasLongLine(doc) ? await loadLanguage(path) : null;
  return EditorState.create({ doc, extensions: [editorExtensions(), indenting.of(indentFor(path, doc.slice(0, INDENT_SAMPLE))), wrapping.of(wrapFor(path) ? EditorView.lineWrapping : []), spellchecking.of(spellcheckFor(path) ? spellcheckAttr : noSpellcheckAttr), lang ?? [], path && ws && root ? [lspExtension(ws, root, path), diagnosticText] : [], path?.startsWith("/") || path?.startsWith("debug://") || path?.startsWith("head://") ? EditorState.readOnly.of(true) : [], path ? snippetCompletion(extOf(path)) : [], path && SWATCHED.has(extOf(path)) ? swatches : [], path && extOf(path) === "md" ? [mdlive, mdRender, ws ? [mdImages.of({ ws, file: path }), pasteImage(ws, path)] : []] : []] });
}
