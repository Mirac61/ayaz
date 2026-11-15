// The project's .editorconfig (root file only): indent style and size per file. Missing keys fall through to the
// file's own indentation and settings.json. shortcut: no nested .editorconfig files, upgrade when a project needs them.
export interface Indent { tabs?: boolean; size?: number; tabWidth?: number }
interface Section { glob: RegExp; props: Record<string, string> }

// *, **, ?, {a,b} and {1..3}-free braces; a glob without "/" matches the file name at any depth.
export function globToRegExp(glob: string): RegExp {
  let re = "", depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") { re += "(?:"; depth++; }
    else if (c === "}" && depth) { re += ")"; depth--; }
    else if (c === "," && depth) re += "|";
    else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(glob.includes("/") ? `^${re.replace(/^\//, "")}$` : `(^|/)${re}$`);
}

export function parseEditorConfig(text: string): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === "#" || line[0] === ";") continue;
    if (line[0] === "[" && line.endsWith("]")) out.push((cur = { glob: globToRegExp(line.slice(1, -1)), props: {} }));
    else if (cur) {
      const eq = line.indexOf("=");
      if (eq > 0) cur.props[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim().toLowerCase();
    }
  }
  return out;
}

export function indentFromConfig(sections: Section[], path: string): Indent {
  const p: Record<string, string> = {};
  for (const s of sections) if (s.glob.test(path)) Object.assign(p, s.props); // later sections win
  const num = (v?: string) => (v && /^\d+$/.test(v) && +v >= 1 && +v <= 16 ? +v : undefined);
  const out: Indent = {};
  if (p.indent_style === "tab" || p.indent_style === "space") out.tabs = p.indent_style === "tab";
  out.size = num(p.indent_size);
  out.tabWidth = num(p.tab_width) ?? (p.indent_size === "tab" ? undefined : out.size);
  return out;
}

let loaded: Section[] = [];
export const setEditorConfig = (text: string) => { loaded = parseEditorConfig(text); };
export const editorConfigIndent = (path: string | null): Indent => (path ? indentFromConfig(loaded, path) : {});
