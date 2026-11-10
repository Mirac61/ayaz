import { LanguageDescription, type LanguageSupport } from "@codemirror/language";

// Extension → highlighter package and language server, one row per language: adding one is one line here.
// Packages load lazily so a Go file never pulls in the Java parser (ADR-0015). lsp: [LSP languageId, server name];
// the server name's command lives in app/lsp.go.
type Loader = () => Promise<LanguageSupport>;
const cpp: Loader = () => import("@codemirror/lang-cpp").then((m) => m.cpp());
const js = (opts: { jsx?: boolean; typescript?: boolean }): Loader => () =>
  import("@codemirror/lang-javascript").then((m) => m.javascript(opts));
const jsPlain = js({});
const langs: Record<string, { load: Loader; lsp?: [string, string] }> = {
  go: { load: () => import("@codemirror/lang-go").then((m) => m.go()), lsp: ["go", "gopls"] },
  c: { load: cpp, lsp: ["c", "clangd"] },
  h: { load: cpp, lsp: ["c", "clangd"] },
  cc: { load: cpp, lsp: ["cpp", "clangd"] },
  cpp: { load: cpp, lsp: ["cpp", "clangd"] },
  hpp: { load: cpp, lsp: ["cpp", "clangd"] },
  js: { load: jsPlain, lsp: ["javascript", "ts"] },
  mjs: { load: jsPlain, lsp: ["javascript", "ts"] },
  jsx: { load: js({ jsx: true }), lsp: ["javascriptreact", "ts"] },
  ts: { load: js({ typescript: true }), lsp: ["typescript", "ts"] },
  tsx: { load: js({ typescript: true, jsx: true }), lsp: ["typescriptreact", "ts"] },
  html: { load: () => import("@codemirror/lang-html").then((m) => m.html()), lsp: ["html", "html"] },
  css: { load: () => import("@codemirror/lang-css").then((m) => m.css()), lsp: ["css", "css"] },
  json: { load: () => import("@codemirror/lang-json").then((m) => m.json()), lsp: ["json", "json"] },
  java: { load: () => import("@codemirror/lang-java").then((m) => m.java()), lsp: ["java", "jdtls"] },
  md: { load: () => import("@codemirror/lang-markdown").then((m) => m.markdown({ base: m.markdownLanguage, codeLanguages })) }, // GFM (Q7)
};

export const extOf = (path: string) => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export const loadLanguage = (path: string): Promise<LanguageSupport | null> =>
  langs[extOf(path)]?.load() ?? Promise.resolve(null);

export const serverFor = (path: string): [lang: string, server: string] | undefined => langs[extOf(path)]?.lsp;

const names: Record<string, string[]> = { go: ["golang"], js: ["javascript"], ts: ["typescript"], cpp: ["c++"], md: ["markdown"] };

// Fenced code blocks in Markdown: info string → language. One entry per loader, so c/h/cc/cpp/hpp share one parser.
const byLoader = new Map<() => Promise<LanguageSupport>, string[]>();
for (const [ext, { load }] of Object.entries(langs)) byLoader.set(load, [...(byLoader.get(load) ?? []), ext]);
export const codeLanguages: LanguageDescription[] = [...byLoader].map(([load, exts]) =>
  LanguageDescription.of({ name: exts[0], alias: [...exts, ...exts.flatMap((e) => names[e] ?? [])], load }));
