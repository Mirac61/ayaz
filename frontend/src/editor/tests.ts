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

type Span = TestRef & { from: number; to: number; suite?: boolean };

// syntaxTree() stops early in a large file (CodeMirror parses in the background); finish it, within 500 ms, before reading.
const syntaxTreeOf = (state: EditorState) => ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state);

// Go: top-level `func Test…(t *testing.T)` in a `_test.go` file. `path` is the file's name, since a state has none.
// shortcut: top-level tests only, upgrade by reading t.Run names
function goTests(state: EditorState, path: string): Span[] {
  if (!path.endsWith("_test.go")) {
    return [];
  }
  const out: Span[] = [];
  const cur = syntaxTreeOf(state).topNode.cursor();
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

const JS_CALLS = new Set(["test", "it", "describe"]);
const JS_MODS = new Set(["only", "skip"]);

// JS/TS: `test("title", …)`, `it(…)` and `describe(…)`, also as `.only` / `.skip`, with a plain string as the first argument.
// `test.each(…)(…)` is not found: its title is a pattern, not a name. Nested calls follow their parent.
// shortcut: a title is the string as written (backslash escapes are dropped, not decoded)
function jsTests(state: EditorState): Span[] {
  const out: Span[] = [];
  const text = (n: SyntaxNode) => state.sliceDoc(n.from, n.to);
  syntaxTreeOf(state).iterate({
    enter(ref) {
      if (ref.name !== "CallExpression") {
        return;
      }
      const callee = ref.node.firstChild;
      const head = callee?.name === "MemberExpression" && JS_MODS.has(text(callee.lastChild!)) ? callee.firstChild : callee;
      const title = ref.node.getChild("ArgList")?.firstChild?.nextSibling;
      if (head?.name !== "VariableName" || !JS_CALLS.has(text(head)) || !title) {
        return;
      }
      if (title.name !== "String" && !(title.name === "TemplateString" && !title.getChild("Interpolation"))) {
        return;
      }
      const name = state.sliceDoc(title.from + 1, title.to - 1).replace(/\\(.)/g, "$1");
      out.push({ name, line: state.doc.lineAt(ref.from).number, from: ref.from, to: ref.to, suite: text(head) === "describe" });
    },
  });
  return out;
}

// Python: `def test_…` at the top level and in `Test…` classes of a `test_*.py` or `*_test.py` file; the name has the class in front.
// shortcut: top-level classes only
function pyTests(state: EditorState, path: string): Span[] {
  if (!/(^|\/)(test_[^/]*|[^/]*_test)\.py$/.test(path)) {
    return [];
  }
  const out: Span[] = [];
  const text = (n: SyntaxNode) => state.sliceDoc(n.from, n.to);
  // `stmt` is a `def`, or a decorated one: a cursor on the decorator is in the test as well
  const add = (stmt: SyntaxNode, prefix: string) => {
    const fn = stmt.name === "DecoratedStatement" ? stmt.getChild("FunctionDefinition") : stmt;
    const id = fn?.name === "FunctionDefinition" ? fn.getChild("VariableName") : null;
    if (fn && id && /^test_/.test(text(id))) {
      out.push({ name: prefix + text(id), line: state.doc.lineAt(fn.from).number, from: stmt.from, to: stmt.to });
    }
  };
  for (let n = syntaxTreeOf(state).topNode.firstChild; n; n = n.nextSibling) {
    const cls = n.name === "ClassDefinition" ? n.getChild("VariableName") : null;
    if (!cls) {
      add(n, "");
    } else if (/^Test/.test(text(cls))) {
      for (let m = n.getChild("Body")?.firstChild; m; m = m.nextSibling) {
        add(m, `${text(cls)}::`);
      }
    }
  }
  return out;
}

const JS_EXTS = new Set(["ts", "tsx", "js", "jsx", "mjs"]);

function spans(state: EditorState, path: string): Span[] {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return ext === "go" ? goTests(state, path) : ext === "py" ? pyTests(state, path) : JS_EXTS.has(ext) ? jsTests(state) : [];
}

export function testsIn(state: EditorState, path: string): TestRef[] {
  return spans(state, path).map(({ name, line }) => ({ name, line }));
}

// The test around pos: its signature or body (a t.Run body belongs to the top-level test), else null.
// In JS the innermost `test`/`it`, else the innermost `describe`.
export function testAt(state: EditorState, path: string, pos: number): TestRef | null {
  const around = spans(state, path).filter((x) => pos >= x.from && pos <= x.to);
  const t = around.filter((x) => !x.suite).pop() ?? around.pop(); // a nested call comes after its parent
  return t ? { name: t.name, line: t.line } : null;
}
