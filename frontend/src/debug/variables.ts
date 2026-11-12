import type { Scope, Variable } from "./dap";

// The variables panel's tree: scopes at the top, a variable with a variablesReference above 0 can be opened to load
// its fields, elements or pointee. Plain data, so it is easy to test; the picker draws it.

export interface Row {
  name: string;
  value: string;
  type?: string;
  ref: number; // 0: nothing below
  open: boolean;
  children?: Row[]; // loaded when opened for the first time
  isWatch?: boolean;
  isWatchScope?: boolean;
}

export const rowOf = (v: Variable): Row => (
  { name: v.name, value: v.value, type: v.type, ref: v.variablesReference, open: false }
);
export const scopeRow = (s: Scope): Row => ({ name: s.name, value: "", ref: s.variablesReference, open: false });

export interface Line { label: string; hint: string; row: Row; depth: number }

// The visible lines: every open row's children follow it, indented. ▾ open, ▸ closed with something below.
export function lines(rows: Row[], depth = 0): Line[] {
  return rows.flatMap((row) => {
    const hasChildren = row.ref > 0 || (row.children && row.children.length > 0);
    const mark = hasChildren ? (row.open ? "▾" : "▸") : " ";
    const value = row.value ? ` = ${row.value}` : "";
    const own: Line = { label: `${"  ".repeat(depth)}${mark} ${row.name}${value}`, hint: row.type ?? "", row, depth };
    return row.open && row.children ? [own, ...lines(row.children, depth + 1)] : [own];
  });
}

// Opens or closes a row, loading its children the first time. load fetches by variablesReference.
export async function toggle(row: Row, load: (ref: number) => Promise<Variable[]>) {
  if (row.ref <= 0) return;
  if (!row.open) row.children ??= (await load(row.ref)).map(rowOf);
  row.open = !row.open;
}
