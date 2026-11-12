import { RangeSet, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";

// Breakpoints of the debugger (M48, M70): markers in a gutter column per line, kept per buffer. They follow edits
// (a line moving down takes its dot along, a deleted line loses it), and the session keeps them between runs.
// Supports plain breakpoints (solid red dot), conditional & hit count breakpoints (hollow red dot),
// and logpoints (red diamond).

export interface Breakpoint {
  line: number;
  condition?: string;
  logMessage?: string;
  hitCondition?: string;
}

export function parseBreakpointPrompt(text: string): { condition?: string; logMessage?: string; hitCondition?: string } {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (/^log:\s*/i.test(trimmed)) {
    const log = trimmed.replace(/^log:\s*/i, "").trim();
    return log ? { logMessage: log } : {};
  }
  if (/^hits?:\s*/i.test(trimmed)) {
    const hits = trimmed.replace(/^hits?:\s*/i, "").trim();
    return hits ? { hitCondition: hits } : {};
  }
  return { condition: trimmed };
}

export function formatBreakpointPrompt(bp: Breakpoint): string {
  if (bp.logMessage) return `log: ${bp.logMessage}`;
  if (bp.hitCondition) return `hits: ${bp.hitCondition}`;
  if (bp.condition) return bp.condition;
  return "";
}

interface Item {
  from: number;
  condition?: string;
  logMessage?: string;
  hitCondition?: string;
}

class Dot extends GutterMarker {
  constructor(private kind: "solid" | "conditional" | "logpoint" = "solid") {
    super();
  }
  toDOM() {
    const d = document.createElement("span");
    d.className = this.kind === "solid" ? "cm-bp-dot" : `cm-bp-dot cm-bp-${this.kind}`;
    return d;
  }
}
const SOLID_DOT = new Dot("solid");
const COND_DOT = new Dot("conditional");
const LOG_DOT = new Dot("logpoint");

function toItem(doc: { line(n: number): { from: number }; lines: number }, bp: number | Breakpoint): Item {
  if (typeof bp === "number") {
    return { from: doc.line(Math.min(Math.max(bp, 1), doc.lines)).from };
  }
  return {
    from: doc.line(Math.min(Math.max(bp.line, 1), doc.lines)).from,
    ...(bp.condition && { condition: bp.condition }),
    ...(bp.logMessage && { logMessage: bp.logMessage }),
    ...(bp.hitCondition && { hitCondition: bp.hitCondition }),
  };
}

const field = StateField.define<Item[]>({
  create: () => [],
  update(items, tr) {
    for (const e of tr.effects) {
      if (!e.is(setBreakpoints)) continue;
      const doc = tr.state.doc;
      const raw = e.value.map((b) => toItem(doc, b));
      return dedupe(raw);
    }
    if (!tr.docChanged || !items.length) return items;
    const old = tr.startState.doc, deleted: [number, number][] = [];
    tr.changes.iterChangedRanges((fromA, toA) => deleted.push([fromA, toA]));
    const kept = items.filter((p) => {
      const line = old.lineAt(p.from), end = Math.min(line.to + 1, old.length);
      return !deleted.some(([from, to]) => from <= line.from && to >= end && to > from);
    });
    const mapped = kept.map((p) => ({ ...p, from: tr.state.doc.lineAt(tr.changes.mapPos(p.from, 1)).from }));
    return dedupe(mapped);
  },
});

function dedupe(items: Item[]): Item[] {
  const seen = new Set<number>();
  const res: Item[] = [];
  const sorted = [...items].sort((a, b) => a.from - b.from);
  for (const item of sorted) {
    if (!seen.has(item.from)) {
      seen.add(item.from);
      res.push(item);
    }
  }
  return res;
}

// Replaces all breakpoints with these lines or breakpoint objects (1-based).
export const setBreakpoints = StateEffect.define<(number | Breakpoint)[]>();
export const setLines = setBreakpoints; // backward compatibility

export const breakpointLines = (s: EditorState): number[] => (s.field(field, false) ?? []).map((p) => s.doc.lineAt(p.from).number);

export const breakpoints = (s: EditorState): Breakpoint[] =>
  (s.field(field, false) ?? []).map((p) => ({
    line: s.doc.lineAt(p.from).number,
    ...(p.condition && { condition: p.condition }),
    ...(p.logMessage && { logMessage: p.logMessage }),
    ...(p.hitCondition && { hitCondition: p.hitCondition }),
  }));

export function getBreakpoint(view: EditorView): Breakpoint | null {
  const s = view.state, line = s.doc.lineAt(s.selection.main.head).number;
  return breakpoints(s).find((b) => b.line === line) ?? null;
}

// Toggles a plain breakpoint on the cursor line; true when there is one now.
export function toggleBreakpoint(view: EditorView): boolean {
  const s = view.state, line = s.doc.lineAt(s.selection.main.head).number;
  const list = breakpoints(s), existing = list.find((b) => b.line === line);
  if (existing) {
    view.dispatch({ effects: setBreakpoints.of(list.filter((b) => b.line !== line)) });
    return false;
  }
  view.dispatch({ effects: setBreakpoints.of([...list, { line }]) });
  return true;
}

// Sets or updates a breakpoint on the cursor line with the given options (condition, logMessage, hitCondition).
export function setBreakpoint(view: EditorView, extra?: { condition?: string; logMessage?: string; hitCondition?: string }): Breakpoint {
  const s = view.state, line = s.doc.lineAt(s.selection.main.head).number;
  const list = breakpoints(s).filter((b) => b.line !== line);
  const bp: Breakpoint = {
    line,
    ...(extra?.condition && { condition: extra.condition }),
    ...(extra?.logMessage && { logMessage: extra.logMessage }),
    ...(extra?.hitCondition && { hitCondition: extra.hitCondition }),
  };
  view.dispatch({ effects: setBreakpoints.of([...list, bp]) });
  return bp;
}

const theme = EditorView.baseTheme({
  ".cm-bp .cm-gutterElement": { width: "12px", display: "flex", alignItems: "center", justifyContent: "center" },
  ".cm-bp-dot": { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--error, #e82424)" }, // kanagawa samuraiRed
  ".cm-bp-dot.cm-bp-conditional": { backgroundColor: "transparent", border: "2px solid var(--error, #e82424)", boxSizing: "border-box" },
  ".cm-bp-dot.cm-bp-logpoint": { borderRadius: "0", transform: "rotate(45deg)", width: "7px", height: "7px" },
});

export const breakpointGutter: Extension = [
  field,
  gutter({
    class: "cm-bp",
    markers: (v) => {
      const items = v.state.field(field, false) ?? [];
      return RangeSet.of(items.map((p) => {
        const marker = p.logMessage ? LOG_DOT : (p.condition || p.hitCondition ? COND_DOT : SOLID_DOT);
        return marker.range(p.from);
      }));
    },
    initialSpacer: () => SOLID_DOT,
  }),
  theme,
];
