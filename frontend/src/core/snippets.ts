import { stripJsonc } from "./settings";

// snippets.json in the config folder, in the shape of VS Code's snippet files, but keyed by file extension like the
// `languages` of settings.json ("*" for every file):
//   { "go": { "iferr": { "prefix": "iferr", "body": ["if err != nil {", "\treturn err", "}"], "description": "..." } } }
// The body is a CodeMirror snippet template: $1, ${1:name} and $0 work; VS Code's variables like $TM_FILENAME don't.

export interface Snippet { prefix: string; body: string; description: string }

let byExt = new Map<string, Snippet[]>();
let problem = "";

export function parseSnippets(json: string): Map<string, Snippet[]> {
  const out = new Map<string, Snippet[]>();
  if (!json.trim()) return out;
  let data: unknown;
  try {
    data = JSON.parse(stripJsonc(json));
  } catch (e) {
    throw new Error(`snippets.json: ${e instanceof Error ? e.message : e}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("snippets.json: expected an object of extensions");
  }
  for (const [ext, group] of Object.entries(data)) {
    if (!group || typeof group !== "object" || Array.isArray(group)) {
      throw new Error(`snippets.json: "${ext}" must be an object of snippets`);
    }
    const list: Snippet[] = [];
    for (const [name, s] of Object.entries(group)) {
      const { prefix, body, description } = (s ?? {}) as Record<string, unknown>;
      const prefixes = Array.isArray(prefix) ? prefix : [prefix];
      if (!prefixes.length || prefixes.some((p) => typeof p !== "string" || !p)) {
        throw new Error(`snippets.json: ${ext}.${name} needs a "prefix" (text, or a list of them)`);
      }
      const lines = Array.isArray(body) ? body : [body];
      if (lines.some((l) => typeof l !== "string")) {
        throw new Error(`snippets.json: ${ext}.${name} needs a "body" (text, or a list of lines)`);
      }
      const text = (lines as string[]).join("\n").replace(/\$(\d+)/g, "${$1}");
      const about = typeof description === "string" ? description : name;
      for (const p of prefixes as string[]) list.push({ prefix: p, body: text, description: about });
    }
    out.set(ext.toLowerCase(), list);
  }
  return out;
}

// Takes snippets.json's text ("" for none); a broken file keeps what was there and snippetsError says why.
export function loadSnippets(json: string) {
  try {
    byExt = parseSnippets(json);
    problem = "";
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }
}

export const snippetsError = () => problem;

// The snippets for a file extension: its own, then the "*" ones.
export const snippetsFor = (ext: string): Snippet[] => [...(byExt.get(ext.toLowerCase()) ?? []), ...(byExt.get("*") ?? [])];
