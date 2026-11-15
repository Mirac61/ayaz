import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

// Text objects from the syntax tree: af/if (function), ac/ic (class, struct, interface), aa/ia (argument),
// ]f/[f (next function) and growing a selection by syntax nodes. Node names are those of the grammars we load
// (Go, JavaScript/TypeScript, C/C++, Java); a name that isn't in the tables just finds nothing.

export type Kind = "function" | "class" | "argument";
export interface Range { from: number; to: number }

const FUNCTION = new Set([
  "FunctionDecl", "MethodDecl", "FunctionLiteral", // Go
  "FunctionDeclaration", "FunctionExpression", "ArrowFunction", "MethodDeclaration", "ConstructorDeclaration", // JS/TS, Java
  "FunctionDefinition", // C/C++
]);
const CLASS = new Set([
  "TypeDecl", // Go
  "ClassDeclaration", "InterfaceDeclaration", "EnumDeclaration", // JS/TS, Java
  "ClassSpecifier", "StructSpecifier", // C/C++
]);
const BLOCK = new Set(["Block", "CompoundStatement", "ConstructorBody"]);
const CLASS_BODY = new Set(["ClassBody", "InterfaceBody", "EnumBody", "StructBody", "FieldDeclarationList"]);
const LIST = new Set(["Arguments", "Parameters", "ArgList", "ParamList", "ArgumentList", "ParameterList", "FormalParameters"]);
const NOT_ARGUMENT = new Set(["(", ")", ",", "LineComment", "BlockComment", "Comment"]);

const nodes = (kind: Kind) => (kind === "function" ? FUNCTION : kind === "class" ? CLASS : LIST);

// The enclosing nodes of pos with a name in names, innermost first.
function around(state: EditorState, pos: number, names: Set<string>): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (names.has(n.name) && n.from <= pos && pos <= n.to) out.push(n);
  }
  return out;
}

// The first node below n named in names, not looking into functions (a class's body, not a method's).
function below(n: SyntaxNode, names: Set<string>): SyntaxNode | null {
  for (let c = n.firstChild; c; c = c.nextSibling) {
    if (names.has(c.name)) return c;
    if (FUNCTION.has(c.name)) continue;
    const found = below(c, names);
    if (found) return found;
  }
  return null;
}

// What's inside braces: the lines between them when the braces sit on lines of their own, else the text trimmed.
function inside(state: EditorState, n: SyntaxNode): Range {
  const doc = state.doc;
  let from = n.from + 1, to = n.to - 1;
  if (doc.sliceString(n.from, n.from + 1) !== "{") return { from: n.from, to: n.to };
  const open = doc.lineAt(n.from), close = doc.lineAt(n.to);
  if (open.number < close.number && open.to === from && /^\s*$/.test(doc.sliceString(close.from, to))) {
    return { from: open.to + 1, to: close.from }; // `dif` leaves "{\n}"
  }
  while (from < to && /\s/.test(doc.sliceString(from, from + 1))) from++;
  while (to > from && /\s/.test(doc.sliceString(to - 1, to))) to--;
  return { from, to };
}

// The text object of kind around pos; count counts outwards (2af is the function around the function).
export function objectRange(state: EditorState, pos: number, kind: Kind, inner: boolean, count = 1): Range | null {
  if (kind === "argument") return argumentRange(state, pos, inner);
  const n = around(state, pos, nodes(kind))[count - 1];
  if (!n) return null;
  if (!inner) return { from: n.from, to: n.to };
  const body = kind === "function" ? n.getChild("Block") ?? below(n, BLOCK) : below(n, CLASS_BODY);
  if (body) return inside(state, body);
  // An arrow function with an expression for a body: the last child.
  const last = n.lastChild;
  return kind === "function" && last && last !== n.firstChild ? { from: last.from, to: last.to } : null;
}

function argumentRange(state: EditorState, pos: number, inner: boolean): Range | null {
  for (const list of around(state, pos, LIST)) {
    // The children between commas: a TypeScript parameter with a default is three nodes (name, =, value).
    const args: Range[] = [];
    let open: Range | null = null;
    for (let c = list.firstChild; c; c = c.nextSibling) {
      if (c.name === ",") open = null;
      else if (!NOT_ARGUMENT.has(c.name)) {
        if (open) open.to = c.to;
        else args.push((open = { from: c.from, to: c.to }));
      }
    }
    if (!args.length) continue;
    // The one under the cursor; on a comma or a space the one before it, before the first one the first.
    let i = args.findIndex((a) => a.from <= pos && pos <= a.to);
    if (i < 0) args.forEach((a, j) => { if (a.to < pos) i = j; });
    if (i < 0) i = 0;
    const a = args[i];
    if (inner) return { from: a.from, to: a.to };
    if (args[i + 1]) return { from: a.from, to: args[i + 1].from }; // with its comma and the space after
    if (i > 0) return { from: args[i - 1].to, to: a.to }; // the last one takes the comma before it
    return { from: a.from, to: a.to };
  }
  return null;
}

// Where the next (forward) or previous function starts, relative to pos; null at the last or first one.
export function functionStart(state: EditorState, pos: number, forward: boolean): number | null {
  let found: number | null = null;
  syntaxTree(state).iterate({
    from: forward ? pos : 0,
    to: forward ? state.doc.length : pos,
    enter(n) {
      if (!FUNCTION.has(n.name)) return;
      const better = found === null || (forward ? n.from < found : n.from > found);
      if (better && (forward ? n.from > pos : n.from < pos)) found = n.from;
    },
  });
  return found;
}

// The smallest syntax node that holds the selection and is bigger than it; null when the selection is the whole tree.
export function growRange(state: EditorState, from: number, to: number): Range | null {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(from, 1); n; n = n.parent) {
    if (n.from <= from && n.to >= to && (n.from < from || n.to > to)) return { from: n.from, to: n.to };
  }
  return null;
}

// The named functions, methods and classes around pos, outermost first, for the sticky header. Anonymous ones
// (function literals, arrow functions) are skipped: their line says nothing about where you are.
const ANONYMOUS = new Set(["FunctionLiteral", "FunctionExpression", "ArrowFunction"]);
export function scopesAt(state: EditorState, pos: number): Range[] {
  const out: Range[] = [];
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if ((FUNCTION.has(n.name) && !ANONYMOUS.has(n.name)) || CLASS.has(n.name)) out.unshift({ from: n.from, to: n.to });
  }
  return out;
}
