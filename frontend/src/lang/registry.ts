import { LanguageDescription, LanguageSupport, StreamLanguage, type StreamParser } from "@codemirror/language";
import { typst } from "./typst";

// Extension → highlighter package and language server, one row per language: adding one is one line here.
// Packages load lazily so a Go file never pulls in the Java parser (ADR-0015). lsp: [LSP languageId, server name];
// the server name's command lives in app/lsp.go.
type Loader = () => Promise<LanguageSupport>;
const cpp: Loader = () => import("@codemirror/lang-cpp").then((m) => m.cpp());
const js = (opts: { jsx?: boolean; typescript?: boolean }): Loader => () =>
  import("@codemirror/lang-javascript").then((m) => m.javascript(opts));
const jsPlain = js({});
const legacy = (mode: () => Promise<StreamParser<unknown>>): Loader => async () => new LanguageSupport(StreamLanguage.define(await mode()));
const python: Loader = () => import("@codemirror/lang-python").then((m) => m.python());
const yaml: Loader = () => import("@codemirror/lang-yaml").then((m) => m.yaml());
const xml: Loader = () => import("@codemirror/lang-xml").then((m) => m.xml());
const sql: Loader = () => import("@codemirror/lang-sql").then((m) => m.sql());
const php: Loader = () => import("@codemirror/lang-php").then((m) => m.php());
const shell = legacy(() => import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell));
const latex = legacy(() => import("@codemirror/legacy-modes/mode/stex").then((m) => m.stex));
const typ: Loader = async () => new LanguageSupport(typst);
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
  py: { load: python, lsp: ["python", "pyright"] },
  pyi: { load: python, lsp: ["python", "pyright"] },
  pyw: { load: python, lsp: ["python", "pyright"] },
  rs: { load: () => import("@codemirror/lang-rust").then((m) => m.rust()), lsp: ["rust", "rust-analyzer"] },
  yaml: { load: yaml, lsp: ["yaml", "yaml"] },
  yml: { load: yaml, lsp: ["yaml", "yaml"] },
  toml: { load: legacy(() => import("@codemirror/legacy-modes/mode/toml").then((m) => m.toml)), lsp: ["toml", "taplo"] },
  sh: { load: shell },
  bash: { load: shell },
  zsh: { load: shell },
  sql: { load: sql },
  xml: { load: xml },
  svg: { load: xml },
  php: { load: php },
  lua: { load: legacy(() => import("@codemirror/legacy-modes/mode/lua").then((m) => m.lua)), lsp: ["lua", "lua-language-server"] },
  dockerfile: { load: legacy(() => import("@codemirror/legacy-modes/mode/dockerfile").then((m) => m.dockerFile)), lsp: ["dockerfile", "dockerfile"] },
  containerfile: { load: legacy(() => import("@codemirror/legacy-modes/mode/dockerfile").then((m) => m.dockerFile)), lsp: ["dockerfile", "dockerfile"] },
  typ: { load: typ, lsp: ["typst", "tinymist"] },
  tex: { load: latex, lsp: ["latex", "texlab"] },
  md: { load: () => import("@codemirror/lang-markdown").then((m) => m.markdown({ base: m.markdownLanguage, codeLanguages })) }, // GFM (Q7)
};

// Dockerfile / Containerfile may have no extension or variants like Dockerfile.dev, *.dockerfile.
const keyOf = (path: string) => {
  if (path.startsWith("docs://")) return "md";
  const ext = extOf(path);
  if (ext && langs[ext]) return ext;
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (langs[name]) return name;
  if (name.startsWith("dockerfile.") || name.endsWith(".dockerfile") || name.startsWith("containerfile.") || name.endsWith(".containerfile")) {
    return "dockerfile";
  }
  return ext || name;
};
export const extOf = (path: string) => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export const loadLanguage = (path: string): Promise<LanguageSupport | null> =>
  langs[keyOf(path)]?.load() ?? Promise.resolve(null);

export const serverFor = (path: string): [lang: string, server: string] | undefined => langs[keyOf(path)]?.lsp;

const names: Record<string, string[]> = {
  go: ["golang"], js: ["javascript"], ts: ["typescript"], cpp: ["c++"], md: ["markdown"], py: ["python"], rs: ["rust"],
  sh: ["shell"], yml: ["yaml"], typ: ["typst"], tex: ["latex"], toml: ["toml"], lua: ["lua"], dockerfile: ["docker", "containerfile"],
};

// Fenced code blocks in Markdown: info string → language. One entry per loader, so c/h/cc/cpp/hpp share one parser.
const byLoader = new Map<() => Promise<LanguageSupport>, string[]>();
for (const [ext, { load }] of Object.entries(langs)) byLoader.set(load, [...(byLoader.get(load) ?? []), ext]);
export const codeLanguages: LanguageDescription[] = [...byLoader].map(([load, exts]) =>
  LanguageDescription.of({ name: exts[0], alias: [...exts, ...exts.flatMap((e) => names[e] ?? [])], load }));
