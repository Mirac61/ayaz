import { StreamLanguage } from "@codemirror/language";

// Typst highlighting by line and token; there is no CM6 package. Headings, `#` code, math, raw text, strings, comments and
// labels are colored. shortcut: markup inside a `#call(...)` argument list isn't told from code; tinymist's semantic tokens
// (M54) color it when the server runs.
const KEYWORDS = new Set([
  "let", "set", "show", "import", "include", "if", "else", "for", "while", "in", "return", "break", "continue", "context",
  "not", "and", "or", "as",
]);

export const typst = StreamLanguage.define<{ comment: number }>({
  startState: () => ({ comment: 0 }),
  token(stream, state) {
    if (state.comment) {
      while (!stream.eol()) {
        if (stream.match("*/")) { state.comment--; break; }
        if (stream.match("/*")) state.comment++;
        else stream.next();
      }
      return "comment";
    }
    if (stream.match("/*")) { state.comment = 1; return "comment"; }
    if (stream.match("//")) { stream.skipToEnd(); return "comment"; }
    if (stream.sol() && stream.match(/^=+\s.*/)) return "heading";
    if (stream.sol() && stream.match(/^\s*(?:[-+]|\d+\.|\/)\s/)) return "meta";
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
    if (stream.match(/^`[^`]*`?/)) return "string";
    if (stream.match(/^\$[^$]*\$?/)) return "atom";
    if (stream.match(/^#[A-Za-z_][\w-]*/)) return KEYWORDS.has(stream.current().slice(1)) ? "keyword" : "variableName";
    if (stream.match(/^[@<][A-Za-z_][\w:.-]*>?/)) return "link";
    if (stream.match(/^\*[^*\n]+\*/)) return "strong";
    if (stream.match(/^_[^_\n]+_/)) return "emphasis";
    if (stream.match(/^\d+(?:\.\d+)?(?:%|pt|em|cm|mm|in|fr)?/)) return "number";
    if (stream.match(/^[A-Za-z_][\w-]*/)) return KEYWORDS.has(stream.current()) ? "keyword" : null;
    stream.next();
    return null;
  },
});
