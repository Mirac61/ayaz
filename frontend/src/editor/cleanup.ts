import type { Text } from "@codemirror/state";

// What :w tidies up: spaces and tabs at line ends go, the file ends in exactly one newline. An empty or blank file
// stays as it is. markdown: two or more spaces at a line end are a hard break and stay, except on the last line
// (where they break nothing).
export function cleanupChanges(doc: Text, markdown: boolean): { from: number; to: number; insert: string }[] {
  const text = doc.toString();
  const tail = /[ \t\n]*$/.exec(text)!.index; // everything after is blank: it becomes one "\n"
  if (tail === 0) return [];
  const changes: { from: number; to: number; insert: string }[] = [];
  for (let i = 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    const ws = /[ \t]+$/.exec(l.text);
    if (!ws || markdown && /^ {2,}$/.test(ws[0])) continue;
    const from = l.from + ws.index;
    if (from >= tail) break; // inside the tail, which is replaced as a whole
    changes.push({ from, to: l.to, insert: "" });
  }
  if (text.slice(tail) !== "\n") changes.push({ from: tail, to: text.length, insert: "\n" });
  return changes;
}
