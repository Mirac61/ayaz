import type { LanguageSupport } from "@codemirror/language";

// Extension → language package, loaded lazily so a Go file never pulls in the Java parser (ADR-0015).
// LSP server IDs join this table in M7/M9.
const cpp = () => import("@codemirror/lang-cpp").then((m) => m.cpp());
const langs: Record<string, () => Promise<LanguageSupport>> = {
  go: () => import("@codemirror/lang-go").then((m) => m.go()),
  c: cpp,
  h: cpp,
  cc: cpp,
  cpp: cpp,
  hpp: cpp,
  js: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  mjs: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  jsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  ts: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
  tsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true, jsx: true })),
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  json: () => import("@codemirror/lang-json").then((m) => m.json()),
  java: () => import("@codemirror/lang-java").then((m) => m.java()),
  md: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
};

export const extOf = (path: string) => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export const loadLanguage = (path: string): Promise<LanguageSupport | null> =>
  langs[extOf(path)]?.() ?? Promise.resolve(null);
