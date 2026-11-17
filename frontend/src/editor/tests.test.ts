import { expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { go } from "@codemirror/lang-go";
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
`;
const state = (doc = SRC) => EditorState.create({ doc, extensions: [go()] });
const pos = (s: string) => SRC.indexOf(s);

test("testsIn finds TestA, Test_b and Test, nothing else", () => {
  expect(testsIn(state(), "p_test.go")).toEqual([
    { name: "TestA", line: 5 },
    { name: "Test_b", line: 11 },
    { name: "Test", line: 23 },
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
