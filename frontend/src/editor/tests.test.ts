import { expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { go } from "@codemirror/lang-go";
import { javascript } from "@codemirror/lang-javascript";
import { testAt, testsIn } from "./tests";

const SRC = `package p

import "testing"

func TestA(t *testing.T) {
	t.Run("sub", func(t *testing.T) {
		t.Log("in sub")
	})
}

func Test_b(t *testing.T) {}

func Testing(t *testing.T) {}

func testHelper(t *testing.T) {}

func TestWithoutT() {}

func TestWrongType(t *foo.T) {}

func (s S) TestMethod(t *testing.T) {}

func Test(t *testing.T) {}

func TestResult(t *testing.T) error { return nil }

func TestTwoNames(t, u *testing.T) {}

func TestUnnamed(*testing.T) {}
`;
const state = (doc = SRC) => EditorState.create({ doc, extensions: [go()] });
const pos = (s: string) => SRC.indexOf(s);

test("testsIn finds TestA, Test_b, Test and TestUnnamed, nothing else", () => {
  expect(testsIn(state(), "p_test.go")).toEqual([
    { name: "TestA", line: 5 },
    { name: "Test_b", line: 11 },
    { name: "Test", line: 23 },
    { name: "TestUnnamed", line: 29 },
  ]);
});

test("testsIn is empty in a file that is not _test.go", () => {
  expect(testsIn(state(), "p.go")).toEqual([]);
  expect(testsIn(state(), "p_test.ts")).toEqual([]);
});

test("testAt: signature, body, sub-test body and outside", () => {
  const a = { name: "TestA", line: 5 };
  expect(testAt(state(), "p_test.go", pos("func TestA") + 8)).toEqual(a);
  expect(testAt(state(), "p_test.go", pos("t.Log"))).toEqual(a);
  expect(testAt(state(), "p_test.go", pos("in sub"))).toEqual(a); // inside t.Run: the top-level test
  expect(testAt(state(), "p_test.go", pos("package"))).toBeNull();
  expect(testAt(state(), "p_test.go", pos("func Testing") + 3)).toBeNull();
  expect(testAt(state(), "p.go", pos("t.Log"))).toBeNull();
});

test("testsIn skips lowercase-after-Test in any script and generic tests", () => {
  const doc = `package p\n\nfunc Testé(t *testing.T) {}\n\nfunc TestG[T any](t *testing.T) {}\n\nfunc TestÉ(t *testing.T) {}\n`;
  expect(testsIn(state(doc), "p_test.go")).toEqual([{ name: "TestÉ", line: 7 }]);
});

test("testsIn finds tests far down in a large file", () => {
  const doc = "package p\n\n" + "var x = 1\n".repeat(5000) + "\nfunc TestLast(t *testing.T) {}\n";
  expect(testsIn(state(doc), "p_test.go").map((t) => t.name)).toEqual(["TestLast"]);
});

const JS = `describe("group", () => {
  it("first", () => {
    expect(1).toBe(1);
  });
  test.only('second', async () => {});
  it.skip(\`third\`, () => {});
  test.each([1, 2])("each %i", () => {});
  test(\`has \${x}\`, () => {});
  test(name, () => {});
  it("it\\'s", () => {});
  helper("not a test", () => {});
  a.test("member", () => {});
});

test("top level", () => {});
`;
const js = (doc = JS) => EditorState.create({ doc, extensions: [javascript({ typescript: true })] });
const jpos = (s: string) => JS.indexOf(s);

test("testsIn (JS): test/it/describe with a plain string title, also .only and .skip", () => {
  expect(testsIn(js(), "a.test.ts")).toEqual([
    { name: "group", line: 1 },
    { name: "first", line: 2 },
    { name: "second", line: 5 },
    { name: "third", line: 6 },
    { name: "it's", line: 10 },
    { name: "top level", line: 15 },
  ]);
  expect(testsIn(js(), "a.test.mjs")).toHaveLength(6);
});

test("testAt (JS): the innermost test, else the innermost describe", () => {
  expect(testAt(js(), "a.test.ts", jpos("expect(1)"))).toEqual({ name: "first", line: 2 });
  expect(testAt(js(), "a.test.ts", jpos("it(") + 1)).toEqual({ name: "first", line: 2 });
  expect(testAt(js(), "a.test.ts", jpos("test.only") + 1)).toEqual({ name: "second", line: 5 });
  expect(testAt(js(), "a.test.ts", jpos("test.each") + 1)).toEqual({ name: "group", line: 1 });
  expect(testAt(js(), "a.test.ts", jpos("describe") + 1)).toEqual({ name: "group", line: 1 });
  expect(testAt(js(), "a.test.ts", jpos("top level") + 1)).toEqual({ name: "top level", line: 15 });
  expect(testAt(js(), "a.test.ts", JS.length)).toBeNull();
});

test("js test titles decode their string escapes", () => {
  const doc = 'test("\\u0061dds \\x62 \\u{63} a\\\\b \\"q\\"", () => {});';
  expect(testsIn(js(doc), "a.test.ts")).toEqual([{ name: 'adds b c a\\b "q"', line: 1 }]);
});
