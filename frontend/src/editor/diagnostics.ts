// Every diagnostic the language servers published for one workspace, also for files that aren't open
// (gopls reports whole packages). The editor's own underlines still come from lsp-client's serverDiagnostics.

// As in LSP: line and character are 0-based, severity 1 error, 2 warning, 3 info, 4 hint.
export interface Published {
  uri: string;
  diagnostics: { range: { start: { line: number; character: number } }; severity?: number; message: string }[];
}
// raw: as the server sent it, for the context of a code action request.
export interface Diag {
  line: number; character: number; severity: number; message: string;
  raw: Published["diagnostics"][number];
}

export class DiagStore {
  private byUri = new Map<string, Map<string, Diag[]>>(); // uri → server → its list
  private fns = new Set<() => void>();

  // A server's list replaces its earlier one for that URI; an empty list clears it. Other servers' lists stay.
  publish(p: Published, server = "") {
    const ds = p.diagnostics.map((d) => ({
      line: d.range.start.line, character: d.range.start.character, severity: d.severity ?? 1, message: d.message, raw: d,
    }));
    const lists = this.byUri.get(p.uri) ?? new Map<string, Diag[]>();
    if (ds.length) lists.set(server, ds);
    else if (!lists.delete(server)) return;
    if (lists.size) this.byUri.set(p.uri, lists);
    else this.byUri.delete(p.uri);
    this.fns.forEach((f) => f());
  }

  counts() {
    let errors = 0, warnings = 0;
    for (const uri of this.byUri.keys()) {
      for (const d of this.forUri(uri)) {
        if (d.severity === 1) errors++;
        else if (d.severity === 2) warnings++;
      }
    }
    return { errors, warnings };
  }

  // All of them, errors before warnings before the rest, then by file and line.
  all(): (Diag & { uri: string })[] {
    const out = [...this.byUri.keys()].flatMap((uri) => this.forUri(uri).map((d) => ({ ...d, uri })));
    return out.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity - b.severity;
      if (a.uri !== b.uri) return a.uri < b.uri ? -1 : 1;
      return a.line - b.line || a.character - b.character;
    });
  }

  forUri(uri: string): Diag[] { return [...this.byUri.get(uri)?.values() ?? []].flat(); }

  onChange(fn: () => void) {
    this.fns.add(fn);
    return () => void this.fns.delete(fn);
  }
}

const stores = new Map<string, DiagStore>();
export function diagnosticsFor(ws: string): DiagStore {
  let s = stores.get(ws);
  if (!s) stores.set(ws, (s = new DiagStore()));
  return s;
}
export const dropDiagnostics = (ws: string) => void stores.delete(ws);
