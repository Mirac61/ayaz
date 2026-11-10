import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

import { BUILTIN_THEMES, DEFAULT_THEME, SYNTAX_KEYS, synVar, type SyntaxColors } from "./themes";

// The syntax colors are CSS variables (--syn-*, set by applyTheme from the theme in settings.json), so a theme change
// reaches open editors at once. The fallback is the default theme's color, for tests that run without a theme applied.
const c = Object.fromEntries(
  SYNTAX_KEYS.map((k) => [k, `var(${synVar(k)}, ${BUILTIN_THEMES[DEFAULT_THEME].syntax[k]})`]),
) as SyntaxColors;

// Surfaces come from the pane (shell.css: bg-1, bg-2 with focus), so the editor itself is transparent.
const theme = EditorView.theme(
  {
    "&": { height: "100%", color: c.fg, backgroundColor: "transparent" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--editor-font-size, 13px)", // settings.json; tests run without tokens.css
      lineHeight: "calc(var(--editor-font-size, 13px) + 11px)",
      paddingTop: "4px",
    },
    "&:not(.cm-focused) .cm-content": { opacity: 0.72 },
    ".cm-content": { caretColor: c.cursor },
    ".cm-gutters": { backgroundColor: "transparent", color: "var(--fg-4, #938aa9)", border: "none", paddingLeft: "16px" },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "32px", padding: "0 16px 0 0", fontSize: "calc(var(--editor-font-size, 13px) - 1px)" },
    // Git signs right of the numbers, like LazyVim's statuscolumn: a bar per line, a triangle where lines went.
    ".cm-git .cm-gutterElement": { width: "3px", marginRight: "5px", position: "relative" },
    ".cm-git-add": { backgroundColor: "var(--git-add)" },
    ".cm-git-mod": { backgroundColor: "var(--git-mod)" },
    ".cm-git-staged": { opacity: 0.4 }, // changes already in the index
    ".cm-git-del::after, .cm-git-deltop::after": {
      content: '""', position: "absolute", left: 0, zIndex: 1, border: "4px solid transparent", borderLeftColor: "var(--git-del)",
    },
    ".cm-git-del::after": { bottom: "-4px" },
    ".cm-git-deltop::after": { top: "-4px" },
    ".cm-git-preview": { margin: 0, padding: "6px 10px", font: "12px/18px var(--font-mono)" },
    ".cm-git-preview .del": { color: "var(--git-del)" },
    ".cm-git-preview .add": { color: "var(--git-add)" },
    ".cm-activeLine": { backgroundColor: "transparent" },
    "&.cm-focused .cm-activeLine": { backgroundColor: c.lineHighlight },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--fg-2, #c8c093)" },
    "&.cm-focused .cm-activeLineGutter": { color: "var(--fg-1, #dcd7ba)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: c.selection },
    // The layer class outweighs codemirror-vim's own cursor colors.
    ".cm-vimCursorLayer .cm-fat-cursor": { background: c.cursor, color: "var(--bg-0, #0f0f10)" },
    "&:not(.cm-focused) .cm-vimCursorLayer .cm-fat-cursor": { background: "none", outline: "1px solid var(--fg-3, #9cabca)" },
    ".cm-matchingBracket": { backgroundColor: c.selection, outline: "none" },
    ".cm-searchMatch": { backgroundColor: "rgb(255 255 255 / 0.1)" },
    ".cm-searchMatch-selected": { backgroundColor: "rgb(255 255 255 / 0.22)" },
    // Tooltips (hover, completion, signature) look like the picker overlay.
    ".cm-tooltip": {
      backgroundColor: "var(--overlay)", color: "var(--fg-2)", border: "1px solid var(--edge-overlay)",
      borderRadius: "2px", boxShadow: "0 8px 24px rgb(0 0 0 / 0.35)", overflow: "hidden",
      fontFamily: "var(--font-ui)", fontSize: "12.5px", lineHeight: "18px",
    },
    ".cm-lsp-documentation": { padding: "8px 12px", maxWidth: "36em", maxHeight: "20em", overflowY: "auto" },
    ".cm-lsp-documentation h1, .cm-lsp-documentation h2, .cm-lsp-documentation h3": {
      margin: "0 0 4px", fontSize: "12.5px", fontWeight: "600", color: "var(--fg-1)",
    },
    ".cm-lsp-documentation hr": { margin: "6px 0", border: "none", borderTop: "1px solid var(--edge-overlay)" },
    ".cm-lsp-documentation ul": { margin: "2px 0", paddingLeft: "18px" },
    ".cm-lsp-documentation code, .cm-lsp-documentation pre": { fontFamily: "var(--font-mono)", fontSize: "12px", color: c.fg },
    ".cm-lsp-documentation a": { color: "var(--accent)", textDecoration: "none" },
    // LSP errors and other dialogs: one flat line over the code, parted by a hairline like the rest of the chrome.
    ".cm-panels-top": { backgroundColor: "transparent", borderBottom: "none" },
    ".cm-panel.cm-dialog": {
      padding: "7px 36px 7px 20px", borderBottom: "1px solid var(--edge-overlay)", color: "var(--fg-2)",
      fontFamily: "var(--font-ui)", fontSize: "12.5px",
    },
    ".cm-dialog form": { display: "flex", alignItems: "center", gap: "8px" },
    ".cm-lsp-message button[type=submit]": { display: "inline", marginLeft: "auto" },
    ".cm-dialog button": { font: "12.5px var(--font-ui)", color: "var(--fg-1)", background: "none", border: "none", padding: "0 4px" },
    ".cm-dialog .cm-dialog-close": { background: "none", color: "var(--fg-3)", top: "50%", transform: "translateY(-50%)", right: "8px" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--bg-3)", color: "var(--fg-1)" },
    // Vim ":" and "/" command bar floats as a Spotlight overlay over the pane.
    ".cm-panels": { backgroundColor: "transparent", color: c.fg, border: "none" },
    ".cm-panels-bottom": {
      position: "fixed", top: "58px", bottom: "auto", left: "50%", transform: "translateX(-50%)",
      width: "min(520px, calc(100% - 32px))", backgroundColor: "var(--overlay, #181920)",
      border: "1px solid var(--edge-overlay)", borderRadius: "2px",
      boxShadow: "0 16px 40px rgb(0 0 0 / 0.45)", zIndex: 10, overflow: "hidden",
    },
    ".cm-vim-panel": { padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: "14px" },
    ".cm-vim-panel input": {
      color: c.fg, fontFamily: "var(--font-mono)", fontSize: "14px",
      background: "none", border: "none", outline: "none",
    },
    ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--error, #e82424)", textUnderlineOffset: "4px" },
    ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy var(--warning, #ff9e3b)", textUnderlineOffset: "4px" },
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
  { tag: t.invalid, color: c.error },
]);

export { c as palette }; // the semantic token colours (editor/semantic.ts) come from the same table
export const cmTheme = [theme, syntaxHighlighting(highlight)];
