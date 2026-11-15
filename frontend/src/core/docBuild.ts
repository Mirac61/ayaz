// Typst and LaTeX (M66): a watcher in a terminal split keeps the PDF next to the source current; the PDF opens beside the source.
import { extOf } from "../lang/registry";

export interface DocBuild {
  cmd: string; // runs through sh, so the user's own shell doesn't matter
  pdf: string; // workspace-relative path of the result
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

// .typ: typst watch recompiles on every save. .tex: tectonic (or latexmk/pdflatex) loop compiles when the file's mtime
// changes (GNU stat first, BSD second). Problem lines reach the quickfix list live on every compilation.
export function docBuild(path: string): DocBuild | null {
  const ext = extOf(path);
  const pdf = `${path.slice(0, -ext.length)}pdf`;
  if (ext === "typ") return { cmd: `typst watch --diagnostic-format short ${quote(path)} ${quote(pdf)}`, pdf };
  if (ext !== "tex") return null;
  const loop = `f=${quote(path)}; t=; while :; do
n=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f"); [ "$n" != "$t" ] && { t=$n; echo '--- compiling ---'; if command -v tectonic >/dev/null 2>&1; then tectonic -X compile "$f" && echo '--- success ---'; elif command -v latexmk >/dev/null 2>&1; then latexmk -pdf -interaction=nonstopmode -file-line-error "$f" && echo '--- success ---'; elif command -v pdflatex >/dev/null 2>&1; then pdflatex -file-line-error -interaction=nonstopmode "$f" && echo '--- success ---'; else echo 'No LaTeX compiler found (install tectonic, latexmk or pdflatex)'; fi; }; sleep 1; done`;
  return { cmd: `sh -c ${quote(loop)}`, pdf };
}
