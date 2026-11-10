import { autocompletion, snippet, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";
import { snippetsFor } from "../core/snippets";

// The user's snippets (snippets.json) in the completion list of files with that extension. The list is read when
// completion starts, so a saved snippets.json applies without reopening anything.
export function snippetCompletion(ext: string): Extension {
  // One source function for the state's lifetime: autocompletion tells sources apart by identity.
  const autocomplete = (cx: CompletionContext): CompletionResult | null => {
    const word = cx.matchBefore(/[\w-]+/);
    const list = snippetsFor(ext);
    if (!list.length || (!word && !cx.explicit)) return null;
    return {
      from: word ? word.from : cx.pos,
      options: list.map((s) => ({
        label: s.prefix, detail: s.description, type: "text", boost: 50, // the user's own go above the server's
        apply: (view, _c, from, to) => snippet(s.body)(view, null as never, from, to),
      })),
      validFor: /^[\w-]*$/,
    };
  };
  const data = [{ autocomplete }];
  return [autocompletion(), EditorState.languageData.of(() => data)];
}
