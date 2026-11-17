import { afterEach, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { go } from "@codemirror/lang-go";
import { editorExtensions } from "./editor";
import { setTestResults, testGutter, type TestStatus } from "./testgutter";

let view: EditorView | null = null;
afterEach(() => {
  const box = view?.dom.parentElement;
  view?.destroy();
  box?.remove();
  view = null;
});

const SRC = `package p

import "testing"

func TestA(t *testing.T) {}

func helper() {}

func TestB(t *testing.T) {}
`;

const clicks: number[] = [];
function mount(path: string, doc = SRC) {
  const el = document.createElement("div");
  document.body.append(el);
  view = new EditorView({
    parent: el,
    state: EditorState.create({
      doc,
      extensions: [editorExtensions(), go(), testGutter(path, (_v, line) => clicks.push(line))],
    }),
  });
  return el;
}
// The editor measures its line heights after a frame; until then the gutter's offsets are estimates.
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
// [line number, class] of every marker, by the line it sits on
const marks = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>(".cm-test")].map((m) => {
    const v = view!,
      top = m.parentElement!.getBoundingClientRect().top;
    const dist = (n: number) => Math.abs(v.coordsAtPos(v.state.doc.line(n).from)!.top - top);
    const line = Array.from({ length: v.state.doc.lines }, (_, i) => i + 1).sort((a, b) => dist(a) - dist(b))[0];
    return [line, m.className.replace("cm-test ", "")];
  });
const results = (o: Record<string, TestStatus>) => view!.dispatch({ effects: setTestResults.of(new Map(Object.entries(o))) });

test("a test file shows a play marker per test function", async () => {
  const el = mount("a_test.go");
  await settle();
  expect(marks(el)).toEqual([
    [5, "cm-test-idle"],
    [9, "cm-test-idle"],
  ]);
});

test("results turn the markers into pass and fail on the right lines; unknown names change nothing", async () => {
  const el = mount("a_test.go");
  results({ TestA: "pass", TestB: "fail", TestGone: "skip" });
  await settle();
  expect(marks(el)).toEqual([
    [5, "cm-test-pass"],
    [9, "cm-test-fail"],
  ]);
  results({ TestA: "skip" });
  await settle();
  expect(marks(el)).toEqual([
    [5, "cm-test-skip"],
    [9, "cm-test-idle"],
  ]);
});

test("typing fades the markers, a new run makes them clear again", async () => {
  const el = mount("a_test.go");
  results({ TestA: "pass", TestB: "fail" });
  view!.dispatch({ changes: { from: 0, insert: "// x\n" } });
  await settle();
  expect(marks(el)).toEqual([
    [6, "cm-test-pass cm-test-stale"],
    [10, "cm-test-fail cm-test-stale"],
  ]);
  results({ TestA: "pass", TestB: "pass" });
  await settle();
  expect(marks(el).map((m) => m[1])).toEqual(["cm-test-pass", "cm-test-pass"]);
});

test("a file without tests gets no markers", async () => {
  expect(marks(mount("a.go"))).toEqual([]);
  view!.destroy();
  expect(marks(mount("a_test.go", "package p\n"))).toEqual([]);
  view!.destroy();
  expect(marks(mount("notes.txt"))).toEqual([]);
});

test("a click on a marker runs that test, with the cursor on its line", async () => {
  const el = mount("a_test.go");
  await settle();
  clicks.length = 0;
  el.querySelectorAll<HTMLElement>(".cm-test")[1].parentElement!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  expect(clicks).toEqual([9]);
  expect(view!.state.doc.lineAt(view!.state.selection.main.head).number).toBe(9);
});
