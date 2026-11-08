import { expect, test } from "vitest";
import { EditorSelection, EditorState, StateEffect } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { codeLanguages } from "../lang/registry";
import { LanguageDescription } from "@codemirror/language";
import { browsable, linkAt, mdDecorations, mdlive, resolveLink, toggleReading } from "./mdlive";

// "|" marks the cursor; "«" and "»" a selection instead. No marker: cursor at the very end.
function state(src: string) {
  const s = src.indexOf("«"), at = src.indexOf("|");
  const doc = src.replace(/[|«»]/g, "");
  const sel = s >= 0 ? EditorSelection.single(s, src.indexOf("»") - 1) : EditorSelection.cursor(at >= 0 ? at : doc.length);
  const st = EditorState.create({ doc, selection: sel, extensions: markdown({ base: markdownLanguage }) });
  ensureSyntaxTree(st, doc.length, 5000);
  return st;
}

// The text as it reads with the hidden markers gone.
function shown(src: string) {
  const st = state(src);
  const doc = st.doc.toString();
  return mdDecorations(st).hide.sort((x, y) => x[0] - y[0]).reduceRight((d, [a, b]) => d.slice(0, a) + d.slice(b), doc);
}

const cases: [src: string, want: string][] = [
  ["# Title\n|", "Title\n"],
  ["## Sub\n|", "Sub\n"],
  ["###### Six\n|", "Six\n"],
  ["#   Spaces\n|", "Spaces\n"],
  ["# Closed ##\n|", "Closed\n"],
  ["#\n|", "\n"],
  ["# Ti|tle", "# Title"], // cursor line keeps its markers
  ["#Title\n|", "#Title\n"], // no space: a paragraph, not a heading
  ["*em*\n|", "em\n"],
  ["_em_\n|", "em\n"],
  ["**strong**\n|", "strong\n"],
  ["__strong__\n|", "strong\n"],
  ["***both***\n|", "both\n"],
  ["a **b** c\n|", "a b c\n"],
  ["~~gone~~\n|", "gone\n"],
  ["`code`\n|", "code\n"],
  ["``a ` b``\n|", "a ` b\n"],
  ["[text](https://x.org)\n|", "text\n"],
  ['[text](a.md "Title")\n|', "text\n"],
  ["[text][ref]\n\n[ref]: https://x.org\n|", "text\n\n[ref]: https://x.org\n"],
  ["[**bold** link](x)\n|", "bold link\n"],
  ["![alt](img.png)\n|", "![alt](img.png)\n"], // images come in M6
  ["<https://x.org>\n|", "<https://x.org>\n"],
  ["```\n**x**\n```\n|", "```\n**x**\n```\n"], // code blocks stay literal
  ["    *x*\n\n|", "    *x*\n\n"], // indented code too
  ["*a*\n|*b*", "a\n*b*"],
  ["|*a*\n*b*", "*a*\nb"],
  ["«*a*\n*b*»\n*c*", "*a*\n*b*\nc"], // a selection keeps all its lines raw
  ["# H\n**s** `c` [l](u)\n|", "H\ns c l\n"],
  ["*un closed\n|", "*un closed\n"],
  ["- *item*\n|", "- item\n"],
  ["> **quote**\n|", "quote\n"], // M6 hides the quote mark too
];

test.each(cases)("%j reads as %j", (src, want) => expect(shown(src)).toBe(want));

test("headings get a line class, code and link text a mark", () => {
  const d = mdDecorations(state("## H\n`c` [l](u)\n|"));
  expect(d.lines).toEqual([{ at: 0, cls: "cm-md-h2" }]);
  expect(d.marks).toEqual([{ from: 6, to: 7, cls: "cm-md-code" }, { from: 10, to: 11, cls: "cm-md-link" }]);
});

test("a range limits the work to it", () => {
  const st = state("*a*\n*b*\n|");
  expect(mdDecorations(st, 4, 7).hide).toEqual([[4, 5], [6, 7]]);
});

test("linkAt finds the URL of links, autolinks and bare URLs", () => {
  const at = (src: string) => { const st = state(src); return linkAt(st, st.selection.main.head); };
  expect(at("see [te|xt](https://x.org) now")).toBe("https://x.org");
  expect(at("see [text](https://x.|org) now")).toBe("https://x.org");
  expect(at("see [text](|a.md#top)")).toBe("a.md#top");
  expect(at("<https://|x.org>")).toBe("https://x.org");
  expect(at("go to https://x.org/a|b.")).toBe("https://x.org/ab");
  expect(at("[te|xt][ref]")).toBeNull();
  expect(at("pl|ain text")).toBeNull();
});

test("resolveLink stays inside the workspace", () => {
  expect(resolveLink("docs/a.md", "b.md")).toBe("docs/b.md");
  expect(resolveLink("docs/a.md", "./sub/b.md#x")).toBe("docs/sub/b.md");
  expect(resolveLink("docs/a.md", "../README.md")).toBe("README.md");
  expect(resolveLink("docs/a.md", "my%20file.md")).toBe("docs/my file.md");
  expect(resolveLink("a.md", "../x.md")).toBeNull();
  expect(resolveLink("a.md", "/etc/passwd")).toBeNull();
  expect(resolveLink("a.md", "https://x.org")).toBeNull();
  expect(resolveLink("a.md", "#anchor")).toBeNull();
});

test("browsable: only real URLs go to the browser", () => {
  expect(browsable("https://x.org")).toBe(true);
  expect(browsable("mailto:a@b.c")).toBe(true);
  expect(browsable("javascript:alert(1)")).toBe(false);
  expect(browsable("file:///etc/passwd")).toBe(false);
  expect(browsable("a.md")).toBe(false);
});

test("reading view hides the markers of the cursor line too", () => {
  const view = { state: null as unknown as EditorState, dispatch(tr: { effects: StateEffect<unknown> }) { this.state = this.state.update(tr).state; } };
  view.state = EditorState.create({ doc: "# H\n**b**", selection: { anchor: 6 }, extensions: [markdown({ base: markdownLanguage }), mdlive] });
  ensureSyntaxTree(view.state, 10, 5000);
  expect(mdDecorations(view.state).hide).toEqual([[0, 2]]); // the cursor line stays raw
  expect(toggleReading(view as never)).toBe(true);
  expect(mdDecorations(view.state).hide).toEqual([[0, 2], [4, 6], [7, 9]]);
  expect(view.state.readOnly).toBe(true);
  expect(toggleReading(view as never)).toBe(false);
  expect(view.state.readOnly).toBe(false);
});

test("toggleReading is null without live preview", () => {
  const view = { state: state("# H\n|") };
  expect(toggleReading(view as never)).toBeNull();
});

const codeLines = (src: string) => mdDecorations(state(src)).lines.map((l) => `${l.at}:${l.cls.replace(/cm-md-/g, "")}`);

test("fenced code: every line gets the code class, the fences are dimmed", () => {
  expect(codeLines("```go\nx := 1\n```\n|")).toEqual(["0:code-line fence", "6:code-line", "13:code-line fence"]);
});

test("an unclosed fence dims only its opening line", () => {
  expect(codeLines("```\ncode\n|")).toEqual(["0:code-line fence", "4:code-line", "9:code-line"]);
});

test("tilde fences, empty blocks and fences with text around", () => {
  expect(codeLines("~~~\na\n~~~\n|")).toEqual(["0:code-line fence", "4:code-line", "6:code-line fence"]);
  expect(codeLines("```\n```\n|")).toEqual(["0:code-line fence", "4:code-line fence"]);
  expect(codeLines("a\n\n```\nb\n```\nc\n|").map((l) => l.split(":")[1])).toEqual(["code-line fence", "code-line", "code-line fence"]);
});

test("indented code is a code line without fences", () => {
  expect(codeLines("    x\n    y\n\n|")).toEqual(["0:code-line", "6:code-line"]);
});

test("a range clips the code lines to it", () => {
  const st = state("```\na\nb\nc\n```\n|");
  expect(mdDecorations(st, 6, 9).lines.map((l) => l.at)).toEqual([6, 8]);
});

test("info strings find their language, c and cpp share one parser", () => {
  const find = (n: string) => LanguageDescription.matchLanguageName(codeLanguages, n, true);
  expect(find("go")).toBe(find("golang"));
  expect(find("ts")).toBe(find("typescript"));
  expect(find("c")).toBe(find("cpp"));
  expect(find("json")).not.toBeNull();
  expect(find("brainfuck")).toBeNull();
});

const quoteLines = (src: string) => mdDecorations(state(src)).lines.filter((l) => l.cls === "cm-md-quote").map((l) => l.at);
const bullets = (src: string) => mdDecorations(state(src)).widgets.map((w) => `${w.kind}@${w.from}`);

test.each<[string, string]>([
  ["> quote\n|", "quote\n"],
  [">quote\n|", "quote\n"],
  ["> a\n> b\n|", "a\nb\n"],
  ["> a\n>\n> b\n|", "a\n\nb\n"],
  ["> > deep\n|", "deep\n"],
  [">  two spaces\n|", " two spaces\n"],
  ["> a\n|> b", "a\n> b"], // the cursor line keeps its mark
  ["> - item\n|", "- item\n"],
  ["> ```\n> x\n> ```\n|", "```\nx\n```\n"],
  ["a > b\n|", "a > b\n"],
])("quote %j reads as %j", (src, want) => expect(shown(src)).toBe(want));

test("quote lines get the border class once, nested or not", () => {
  expect(quoteLines("> a\n> b\n|")).toEqual([0, 4]);
  expect(quoteLines("> a\n> > b\n|")).toEqual([0, 4]);
  expect(quoteLines("> lazy\ncontinued\n\nplain\n|")).toEqual([0, 7]);
  expect(quoteLines("plain\n|")).toEqual([]);
});

test("bullet markers - * + become a widget, ordered ones stay", () => {
  expect(bullets("- a\n* b\n+ c\n|")).toEqual(["bullet@0", "bullet@4", "bullet@8"]);
  expect(bullets("1. a\n2) b\n|")).toEqual([]);
  expect(bullets("  - nested\n|")).toEqual(["bullet@2"]);
  expect(bullets("- a\n  - b\n|")).toEqual(["bullet@0", "bullet@6"]);
  expect(bullets("- a\n|- b")).toEqual(["bullet@0"]); // the cursor line keeps its marker
  expect(bullets("- a\n- b\n\n---\n|")).toEqual(["bullet@0", "bullet@4"]); // a rule is no bullet
  expect(bullets("- *em*\n|")).toEqual(["bullet@0"]);
  expect(bullets("```\n- x\n```\n|")).toEqual([]);
});
