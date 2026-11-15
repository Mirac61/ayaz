import type { Text } from "@codemirror/state";

const counted = new WeakMap<Text, number>();
const MAX_DOC = 500_000; // characters; counting a bigger document on every keystroke would be felt

// Words as `wc -w` counts them. The status line asks on every cursor move, but a document value only changes with an edit,
// so the count is kept per value.
export function countWords(doc: Text): number | null {
  if (doc.length > MAX_DOC) return null;
  let n = counted.get(doc);
  if (n === undefined) {
    n = 0;
    for (const line of doc.iterLines()) n += line.match(/\S+/g)?.length ?? 0;
    counted.set(doc, n);
  }
  return n;
}

// What the status line says about a selection: lines when it spans several, else characters. "" when empty.
export function selectionSize(doc: Text, from: number, to: number): string {
  if (from === to) return "";
  const lines = doc.lineAt(to).number - doc.lineAt(from).number + 1;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return lines > 1 ? plural(lines, "line") : plural(to - from, "char");
}
