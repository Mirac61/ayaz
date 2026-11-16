// Finds the tests in a document from its syntax tree, for the test runner.

import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { TestRef } from "../core/tests";

// Go: top-level `func Test…(t *testing.T)` in a `_test.go` file. `path` is the file's name, since a state has none.
// shortcut: top-level tests only, upgrade by reading t.Run names
function goTests(state: EditorState, path: string): (TestRef & { from: number; to: number })[] {
  if (!path.endsWith("_test.go")) {
    return [];
  }
  const out: (TestRef & { from: number; to: number })[] = [];
  const cur = syntaxTree(state).topNode.cursor();
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
    const name = nameNode && state.sliceDoc(nameNode.from, nameNode.to);
    // `Test` alone or followed by a non-lowercase character: TestFoo, Test_foo, but not Testing
    if (!name || !/^Test(?![a-z])/.test(name) || params.length !== 1) {
      continue;
    }
    const type = params[0].getChild("PointerType");
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
