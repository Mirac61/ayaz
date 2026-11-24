import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";
import { backend } from "../core/backend";

// File completion for Markdown links: after `](` or `[[` (also `![](` / `![[`) the workspace's files are offered,
// written relative to the open file.

const LIMIT = 40;
const POOL = 400;
const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif)$/i;
const TRIGGER = /(!?)(\]\(|\[\[)([^\]\)\s]*)$/; // 1: "!" for an image, 3: what is typed of the path

// The link text from the file `from` to the workspace path `to`: "./assets/a.png", "../b.md".
export function relPath(from: string, to: string): string {
  const dir = from.split("/").slice(0, -1);
  const dst = to.split("/");
  let i = 0;
  while (i < dir.length && i < dst.length - 1 && dir[i] === dst[i]) {
    i++;
  }
  const up = dir.length - i;
  return (up ? "../".repeat(up) : "./") + dst.slice(i).join("/");
}

export const mdLinkCompletion = (ws: string, file: string): Extension => {
  const source = async (cx: CompletionContext): Promise<CompletionResult | null> => {
    const line = cx.state.doc.lineAt(cx.pos);
    const m = TRIGGER.exec(line.text.slice(0, cx.pos - line.from));
    if (!m) {
      return null;
    }
    // The fuzzy search knows workspace paths, not "./" or "../": search the part after them.
    const query = m[3].replace(/^(\.{1,2}\/)+/, "");
    // shortcut: the search is cut at POOL paths, so an empty query in a huge repo may miss files next to this one; type a few letters.
    const found = await backend.files(ws).find(query, POOL, false);
    // An image link takes images only; a file never links to itself; files next to this one come first, the rest keeps its rank.
    const dir = file.slice(0, file.lastIndexOf("/") + 1);
    const paths = found
      .map((f) => f.path)
      .filter((p) => p !== file && (!m[1] || IMAGE.test(p)))
      .sort((a, b) => Number(b.startsWith(dir)) - Number(a.startsWith(dir)));
    return {
      from: cx.pos - m[3].length,
      filter: false, // already ranked by the search
      options: paths.slice(0, LIMIT).map((p) => ({ label: relPath(file, p).replace(/ /g, "%20"), type: "file" })),
    };
  };
  return [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: source }])];
};
