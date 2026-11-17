// Finds the tests in a document from its syntax tree, for the test runner.

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import type { TestRef } from "../core/tests";

// A result (`error`, `(int, error)`) sits between the parameters and the body.
const hasResult = (fn: SyntaxNode) => {
  const next = fn.getChild("Parameters")?.nextSibling;
  return !!next && next.name !== "Block";
};

type Span = TestRef & { from: number; to: number };

// Go: top-level `func Test…(t *testing.T)` in a `_test.go` file. `path` is the file's name, since a state has none.
// shortcut: top-level tests only, upgrade by reading t.Run names
function goTests(state: EditorState, path: string): Span[] {
  if (!path.endsWith("_test.go")) {
    return [];
  }
  const out: Span[] = [];
  // syntaxTree() stops early in a large file (CodeMirror parses in the background); finish it, within 500 ms, before reading.
  const cur = (ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state)).topNode.cursor();
  if (!cur.firstChild()) {
    return out;
  }
  do {
    if (cur.name !== "FunctionDecl") {
      continue;
    }
    const { from, to, node } = cur;
    const nameNode = node.getChild("DefName");
    const params = node.getChild("Parameters")?.getChildren("Parameter") ?? [];
    // go runs only `func(*testing.T)`: one parameter, a single name at most, and no result
    const [first] = params;
    const oneField = first && first.getChildren("DefName").length <= 1;
    const name = nameNode && state.sliceDoc(nameNode.from, nameNode.to);
    // `Test` alone or followed by a non-lowercase character: TestFoo, Test_foo, but not Testing or Testé; generics are never run
    if (
      !name ||
      !/^Test(?!\p{Ll})/u.test(name) ||
      params.length !== 1 ||
      !oneField ||
      hasResult(node) ||
      node.getChild("TypeParams")
    ) {
      continue;
    }
    const type = first.getChild("PointerType");
    if (type && state.sliceDoc(type.from, type.to).replace(/\s/g, "") === "*testing.T") {
      out.push({ name, line: state.doc.lineAt(from).number, from, to });
    }
  } while (cur.nextSibling());
  return out;
}

export function testsIn(state: EditorState, path: string): TestRef[] {
  return goTests(state, path).map(({ name, line }) => ({ name, line }));
}

// The test around pos: its signature or body (a t.Run body belongs to the top-level test), else null.
export function testAt(state: EditorState, path: string, pos: number): TestRef | null {
  const t = goTests(state, path).find((x) => pos >= x.from && pos <= x.to);
  return t ? { name: t.name, line: t.line } : null;
}
