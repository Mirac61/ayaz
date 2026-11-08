import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Kanagawa (wave) for CodeMirror, colors as kanagawa.nvim maps its Treesitter groups.
const c = {
  bg: "#1f1f28", bgDim: "#16161d", bgLine: "#2a2a37", sel: "#2d4f67", gutter: "#54546d", fg: "#dcd7ba",
  comment: "#727169", keyword: "#957fb8", fn: "#7e9cd8", string: "#98bb6c", number: "#d27e99",
  type: "#7aa89f", constant: "#ffa066", operator: "#c0a36e", punct: "#9cabca", special: "#e6c384",
  ident: "#e6c384", field: "#e6c384", param: "#b8b4d0", red: "#e82424", cursor: "#c8c093",
};

const theme = EditorView.theme(
  {
    "&": { height: "100%", color: c.fg, backgroundColor: c.bg },
    ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.5" },
    ".cm-content": { caretColor: c.cursor },
    ".cm-gutters": { backgroundColor: c.bg, color: c.gutter, border: "none" },
    ".cm-activeLine": { backgroundColor: c.bgLine },
    ".cm-activeLineGutter": { backgroundColor: c.bgLine, color: c.special },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: c.sel },
    ".cm-fat-cursor": { background: c.cursor, color: c.bg },
    "&:not(.cm-focused) .cm-fat-cursor": { background: "none", outline: `1px solid ${c.cursor}` },
    ".cm-matchingBracket": { backgroundColor: c.sel, outline: "none" },
    ".cm-searchMatch": { backgroundColor: "#2d4f6780", outline: `1px solid ${c.sel}` },
    ".cm-panels": { backgroundColor: c.bgDim, color: c.fg },
    ".cm-vim-panel input": { color: c.fg, fontFamily: "var(--font-mono)" },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: t.comment, color: c.comment, fontStyle: "italic" },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword], color: c.keyword },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: c.fn },
  { tag: [t.string, t.special(t.string), t.regexp], color: c.string },
  { tag: [t.number, t.bool], color: c.number },
  { tag: [t.typeName, t.className, t.namespace], color: c.type },
  { tag: [t.constant(t.variableName), t.null, t.atom], color: c.constant },
  { tag: [t.operator, t.derefOperator], color: c.operator },
  { tag: [t.punctuation, t.bracket, t.separator], color: c.punct },
  { tag: [t.propertyName, t.attributeName], color: c.field },
  { tag: t.tagName, color: c.fn },
  { tag: t.heading, color: c.fn, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.link, color: c.type, textDecoration: "underline" },
  { tag: t.invalid, color: c.red },
]);

export const kanagawaCM = [theme, syntaxHighlighting(highlight)];
