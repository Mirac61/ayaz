import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";
import { backend } from "../core/backend";

// File completion for Markdown links: after `](` or `[[` (also `![](` / `![[`) the workspace's files are offered,
// written relative to the open file.

const LIMIT = 40;
const POOL = 400;
const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif)$/i;
const TRIGGER = /(?:\]\(|\[\[)([^\]\)\s]*)$/; // 1: what is typed of the path
const IMAGE_LINK = /!(?:\[[^\]]*\]\(|\[\[)[^\]\)\s]*$/; // ![alt](path or ![[path

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

// What the cursor is typing after the line's text `before`: a link path, and whether it belongs to an image.
export function linkAt(before: string): { typed: string; image: boolean } | null {
  const m = TRIGGER.exec(before);
  return m && { typed: m[1], image: IMAGE_LINK.test(before) };
}

export const mdLinkCompletion = (ws: string, file: string): Extension => {
  const source = async (cx: CompletionContext): Promise<CompletionResult | null> => {
    const line = cx.state.doc.lineAt(cx.pos);
    const at = linkAt(line.text.slice(0, cx.pos - line.from));
    if (!at) {
      return null;
    }
    const { typed, image } = at;
    // The fuzzy search knows workspace paths, not "./" or "../": search the part after them.
    const query = typed.replace(/^(\.{1,2}\/)+/, "");
    // shortcut: the search is cut at POOL paths, so an empty query in a huge repo may miss files next to this one; type a few letters.
    const found = await backend.files(ws).find(query, POOL, false);
    // An image link takes images only; a file never links to itself; files next to this one come first, the rest keeps its rank.
    const dir = file.slice(0, file.lastIndexOf("/") + 1);
    const paths = found
      .map((f) => f.path)
      .filter((p) => p !== file && (!image || IMAGE.test(p)))
      .sort((a, b) => Number(b.startsWith(dir)) - Number(a.startsWith(dir)));
    return {
      from: cx.pos - typed.length,
      filter: false, // already ranked by the search
      options: paths.slice(0, LIMIT).map((p) => ({ label: relPath(file, p).replace(/ /g, "%20"), type: "file" })),
    };
  };
  return [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: source }])];
};
