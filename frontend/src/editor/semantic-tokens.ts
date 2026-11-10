// Semantic tokens (LSP 3.16): the server sends every token as five numbers relative to the one before.

export interface Legend { tokenTypes: string[]; tokenModifiers: string[] }
export interface Token { line: number; start: number; length: number; type: string; modifiers: string[] }
export interface DataEdit { start: number; deleteCount: number; data?: number[] }

// Columns are UTF-16 units, what the client asks for and CodeMirror counts in.
export function decodeTokens(data: number[], legend: Legend): Token[] {
  const out: Token[] = [];
  let line = 0, start = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    line += data[i];
    start = data[i] === 0 ? start + data[i + 1] : data[i + 1];
    const mods = data[i + 4];
    out.push({
      line, start, length: data[i + 2], type: legend.tokenTypes[data[i + 3]] ?? "",
      modifiers: legend.tokenModifiers.filter((_, bit) => mods & (1 << bit)),
    });
  }
  return out;
}

// The edits of a `full/delta` answer applied to the data of the previous result, in the server's order of start.
export function applyEdits(data: number[], edits: DataEdit[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const e of [...edits].sort((a, b) => a.start - b.start)) {
    out.push(...data.slice(at, e.start), ...(e.data ?? []));
    at = e.start + e.deleteCount;
  }
  return [...out, ...data.slice(at)];
}

// The CSS class a token gets: its type, so the theme colours it; "readonly" and "defaultLibrary" get their own.
export function tokenClass(t: Token): string {
  const mods = t.modifiers.filter((m) => m === "readonly" || m === "defaultLibrary" || m === "deprecated");
  return ["cm-sem-" + t.type, ...mods.map((m) => "cm-sem-" + m)].join(" ");
}
