import { describe, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { go } from "@codemirror/lang-go";
import { javascript } from "@codemirror/lang-javascript";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { functionStart, growRange, objectRange, type Kind } from "./structure";

// "|" marks the cursor; the answer is the text of the range.
function text(lang: unknown, src: string, kind: Kind, inner: boolean, count = 1) {
  const at = src.indexOf("|");
  const doc = src.slice(0, at) + src.slice(at + 1);
  const state = EditorState.create({ doc, extensions: [lang as never] });
  const r = objectRange(state, at, kind, inner, count);
  return r && doc.slice(r.from, r.to);
}

const GO = "package main\n\nfunc add(a int, b string) int {\n\treturn a + |len(b)\n}\n\nfunc other() {}\n";

describe("function", () => {
  test("Go: the whole declaration, or the lines inside its braces", () => {
    expect(text(go(), GO, "function", false)).toBe("func add(a int, b string) int {\n\treturn a + len(b)\n}");
    expect(text(go(), GO, "function", true)).toBe("\treturn a + len(b)\n");
  });
  test("Go: a method and a function literal, outwards with a count", () => {
    const src = "package p\n\nfunc (t T) m() {\n\tf := func(x int) { use(|x) }\n}\n";
    expect(text(go(), src, "function", false)).toBe("func(x int) { use(x) }");
    expect(text(go(), src, "function", true)).toBe("use(x)");
    expect(text(go(), src, "function", false, 2)).toContain("func (t T) m()");
    expect(text(go(), src, "function", false, 3)).toBeNull();
  });
  test("TypeScript: functions, methods, arrow functions with or without a block", () => {
    expect(text(javascript({ typescript: true }), "function f(a) { return |a }", "function", true)).toBe("return a");
    expect(text(javascript(), "const h = (x) => x +| 1", "function", false)).toBe("(x) => x + 1");
    expect(text(javascript(), "const h = (x) => x +| 1", "function", true)).toBe("x + 1");
    expect(text(javascript(), "class A {\n  m() { r|eturn 1 }\n}", "function", false)).toBe("m() { return 1 }");
  });
  test("C and Java", () => {
    expect(text(cpp(), "int main() {\n  return |0;\n}\n", "function", true)).toBe("  return 0;\n");
    expect(text(java(), "class A {\n  int m() { return |1; }\n}", "function", false)).toBe("int m() { return 1; }");
  });
  test("outside any function there is none", () => {
    expect(text(go(), "package main\n\nvar |x = 1\n", "function", false)).toBeNull();
  });
});

describe("class", () => {
  test("Go types, JS classes, C++ structs, Java interfaces", () => {
    expect(text(go(), "package p\n\ntype T struct {\n\ta |int\n}\n", "class", false)).toBe("type T struct {\n\ta int\n}");
    expect(text(go(), "package p\n\ntype T struct {\n\ta |int\n}\n", "class", true)).toBe("\ta int\n");
    expect(text(javascript(), "class A {\n  m() {}|\n}", "class", true)).toBe("  m() {}\n");
    expect(text(cpp(), "struct S { int |a; };", "class", true)).toBe("int a;");
    expect(text(java(), "interface I { void |m(); }", "class", false)).toBe("interface I { void m(); }");
  });
});

describe("argument", () => {
  const ts = javascript({ typescript: true });
  test("inner is the argument, outer takes a comma", () => {
    expect(text(ts, "f(aa, b|b, cc)", "argument", true)).toBe("bb");
    expect(text(ts, "f(aa, b|b, cc)", "argument", false)).toBe("bb, ");
    expect(text(ts, "f(aa, bb, c|c)", "argument", false)).toBe(", cc"); // the last one takes the comma before it
    expect(text(ts, "f(o|nly)", "argument", false)).toBe("only");
  });
  test("the innermost list, parameters too, and a nested call", () => {
    expect(text(ts, "f(a, g(x, |y), c)", "argument", true)).toBe("y");
    expect(text(ts, "function f(a: number, |b = 2) {}", "argument", true)).toBe("b = 2");
    expect(text(go(), "package p\n\nfunc f(a int, b string) {}\n", "argument", true)).toBeNull(); // cursor on `package`
    expect(text(go(), "package p\n\nfunc f(a int, |b string) {}\n", "argument", true)).toBe("b string");
    expect(text(cpp(), "int f(int a, char |*b);", "argument", true)).toBe("char *b");
  });
  test("on the comma or a space: the argument before", () => {
    expect(text(ts, "f(aa,| bb)", "argument", true)).toBe("aa");
  });
});

describe("function jumps", () => {
  const src = "package p\n\nfunc a() {}\n\nfunc b() {\n\tx := func() {}\n}\n\nfunc c() {}\n";
  const state = EditorState.create({ doc: src, extensions: [go()] });
  const at = (s: string) => src.indexOf(s);
  test("]f and [f land on starts", () => {
    expect(functionStart(state, 0, true)).toBe(at("func a"));
    expect(functionStart(state, at("func a"), true)).toBe(at("func b"));
    expect(functionStart(state, at("func b"), true)).toBe(at("func() {}\n}")); // the literal inside b
    expect(functionStart(state, at("func c"), true)).toBeNull();
    expect(functionStart(state, at("func c"), false)).toBe(at("func() {}\n}"));
    expect(functionStart(state, at("func a"), false)).toBeNull();
  });
});

describe("growing a selection", () => {
  test("each step is the next bigger node, up to the whole file", () => {
    const src = "package p\n\nfunc f() {\n\tg(abc, 1)\n}\n";
    const state = EditorState.create({ doc: src, extensions: [go()] });
    const start = src.indexOf("abc");
    const chain: string[] = [];
    let from = start, to = start + 3;
    for (let i = 0; i < 20; i++) {
      const r = growRange(state, from, to);
      if (!r) break;
      chain.push(src.slice(r.from, r.to));
      ({ from, to } = r);
    }
    expect(chain).toContain("(abc, 1)");
    expect(chain).toContain("g(abc, 1)");
    expect(chain).toContain("{\n\tg(abc, 1)\n}");
    expect(chain[chain.length - 1]).toContain("package p");
    expect(new Set(chain).size).toBe(chain.length); // never the same range twice
  });
});
