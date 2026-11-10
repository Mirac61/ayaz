// Every diagnostic the language servers published for one workspace, also for files that aren't open
// (gopls reports whole packages). The editor's own underlines still come from lsp-client's serverDiagnostics.

// As in LSP: line and character are 0-based, severity 1 error, 2 warning, 3 info, 4 hint.
export interface Diag { line: number; character: number; severity: number; message: string }
export interface Published {
  uri: string;
  diagnostics: { range: { start: { line: number; character: number } }; severity?: number; message: string }[];
}

export class DiagStore {
  private byUri = new Map<string, Diag[]>();
  private fns = new Set<() => void>();

  // A server's list replaces the earlier one for that URI; an empty list clears it.
  // shortcut: keyed by URI alone, so two servers on one file overwrite each other; key by server if that comes up.
  publish(p: Published) {
    const ds = p.diagnostics.map((d) => ({
      line: d.range.start.line, character: d.range.start.character, severity: d.severity ?? 1, message: d.message,
    }));
    if (ds.length) this.byUri.set(p.uri, ds);
    else if (!this.byUri.delete(p.uri)) return;
    this.fns.forEach((f) => f());
  }

  counts() {
    let errors = 0, warnings = 0;
    for (const ds of this.byUri.values()) {
      for (const d of ds) {
        if (d.severity === 1) errors++;
        else if (d.severity === 2) warnings++;
      }
    }
    return { errors, warnings };
  }

  // All of them, errors before warnings before the rest, then by file and line.
  all(): (Diag & { uri: string })[] {
    const out = [...this.byUri].flatMap(([uri, ds]) => ds.map((d) => ({ ...d, uri })));
    return out.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity - b.severity;
      if (a.uri !== b.uri) return a.uri < b.uri ? -1 : 1;
      return a.line - b.line || a.character - b.character;
    });
  }

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
