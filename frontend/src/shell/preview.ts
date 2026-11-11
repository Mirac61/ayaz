import { highlightTree } from "@lezer/highlight";
import type { Files } from "../core/backend";
import { loadLanguage } from "../lang/registry";
import { highlightStyle } from "../theme/cm-theme";

// A run of text and the CSS class the editor's highlight style gives it ("" for none).
export type Span = [text: string, cls: string];

// What a picker shows beside the cursor item: a file's start, or the lines around a search hit.
export interface Preview {
  title: string;
  text: string;
  first: number; // line number of the first line of text, 1-based
  line?: number; // the line to point at
  more: boolean; // the file goes on after text
  spans: Span[][] | null; // text split into lines of colored runs; null: no language known
}

// The editor's own colors for a piece of a file. A window cut from the middle of a file may start inside a comment or a
// string and color a little wrong; the lines around a hit are the point, not the exact parse.
export async function colorLines(path: string, text: string): Promise<Span[][] | null> {
  const lang = await loadLanguage(path).catch(() => null);
  if (!lang) return null;
  const lines: Span[][] = [[]];
  let pos = 0;
  const put = (to: number, cls: string) => {
    const [first, ...rest] = text.slice(pos, to).split("\n");
    if (first) lines[lines.length - 1].push([first, cls]);
    for (const line of rest) lines.push(line ? [[line, cls]] : []);
    pos = to;
  };
  highlightTree(lang.language.parser.parse(text), highlightStyle, (from, to, cls) => { put(from, ""); put(to, cls); });
  put(text.length, "");
  return lines;
}

const HEAD_BYTES = 24 * 1024;
const HIT_BYTES = 4 * 1024 * 1024; // a search hit deeper than this in a file gets no preview: the read stays small
const BEFORE = 30;
const AFTER = 70;

export async function previewFile(files: Files, path: string, line?: number): Promise<Preview | null> {
  if (!line) {
    const p = await files.preview(path, HEAD_BYTES);
    return { title: path, text: p.text, first: 1, more: p.more, spans: await colorLines(path, p.text) };
  }
  // A hit can sit anywhere, so the head won't do. Library files (absolute paths: the stdlib) are read whole, as a jump does.
  const read = path.startsWith("/") ? (await files.readText(path)).content : (await files.preview(path, HIT_BYTES)).text;
  const lines = read.split(/\r?\n/);
  if (line > lines.length) return null;
  const first = Math.max(1, line - BEFORE);
  const last = Math.min(lines.length, line + AFTER);
  const text = lines.slice(first - 1, last).join("\n");
  return { title: path, text, first, line, more: last < lines.length, spans: await colorLines(path, text) };
}
