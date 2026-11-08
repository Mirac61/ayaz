import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { foldedRanges } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { editorExtensions } from "../editor";
import { installVim, type VimHost } from "./setup";

// Vim core list (04-testing, Q20): real key presses into a real editor in WebKit.
// "|" in start/want marks the cursor. A want without "|" checks only the text.

// The real setup: jk, leader, folds. Ex tests below swap in a recording host.
installVim({ write: async () => false, edit: async () => {}, quit: async () => {}, focusTree: () => {} });

let view: EditorView | null = null;
afterEach(() => {
  // destroy() detaches view.dom, so remove the container itself; leftovers push new editors off-screen.
  const box = view?.dom.parentElement;
  view?.destroy();
  box?.remove();
  view = null;
});

function mount(text: string, extra: unknown[] = []) {
  const at = text.indexOf("|");
  const el = document.createElement("div");
  el.style.cssText = "height:200px;width:400px";
  document.body.append(el);
  view = new EditorView({
    parent: el,
    state: EditorState.create({
      doc: at < 0 ? text : text.slice(0, at) + text.slice(at + 1),
      selection: { anchor: Math.max(at, 0) },
      extensions: [editorExtensions(), extra as never],
    }),
  });
  view.focus();
  return view;
}

// Vim notation → userEvent syntax: <Esc>, <CR>, <C-x>; literal { and [ are doubled.
const toUserEvent = (keys: string) =>
  keys.replace(/<(Esc|CR|C-(.))>|([{[])/g, (_, k, ctrl, lit) =>
    lit ? lit + lit : ctrl ? `{Control>}${ctrl}{/Control}` : k === "Esc" ? "{Escape}" : "{Enter}");

async function run(start: string, keys: string, extra: unknown[] = []) {
  const v = mount(start, extra);
  await userEvent.keyboard(toUserEvent(keys));
  return v;
}

const shown = (v: EditorView, withCursor: boolean) => {
  const doc = v.state.doc.toString();
  const head = v.state.selection.main.head;
  return withCursor ? doc.slice(0, head) + "|" + doc.slice(head) : doc;
};

type Case = [keys: string, start: string, want: string];

const groups: Record<string, Case[]> = {
  moving: [
    ["h", "ab|c", "a|bc"], ["l", "|abc", "a|bc"], ["j", "a|bc\ndef", "abc\nd|ef"], ["k", "abc\nd|ef", "a|bc\ndef"],
    ["w", "|foo bar", "foo |bar"], ["b", "foo b|ar", "foo |bar"], ["e", "|foo bar", "fo|o bar"],
    ["W", "|a.b c", "a.b |c"], ["B", "a.b |c", "|a.b c"], ["E", "|a.b c", "a.|b c"],
    ["0", "  ab|c", "|  abc"], ["^", "  ab|c", "  |abc"], ["$", "|abc", "ab|c"],
    ["gg", "a\nb\n|c", "|a\nb\nc"], ["G", "|a\nb\nc", "a\nb\n|c"], ["2G", "|a\nb\nc", "a\n|b\nc"],
    ["fc", "|abcabc", "ab|cabc"], ["tc", "|abcabc", "a|bcabc"], ["Fa", "abcab|c", "abc|abc"], ["Ta", "abcab|c", "abca|bc"],
    ["fc;", "|abcabc", "abcab|c"], ["fc;,", "|abcabc", "ab|cabc"], ["%", "|(a)", "(a|)"],
  ],
  search: [
    ["/foo<CR>", "|foo bar foo", "foo bar |foo"], ["?bar<CR>", "foo bar |foo", "foo |bar foo"],
    ["/foo<CR>n", "|x foo foo", "x foo |foo"], ["/foo<CR>nN", "|x foo foo", "x |foo foo"],
    ["*", "|foo x foo", "foo x |foo"], ["#", "foo x |foo", "|foo x foo"],
  ],
  insert: [
    ["ix<Esc>", "a|bc", "a|xbc"], ["ax<Esc>", "a|bc", "ab|xc"], ["Ix<Esc>", "  ab|c", "  |xabc"], ["Ax<Esc>", "|abc", "abc|x"],
    ["ox<Esc>", "|a\nb", "a\n|x\nb"], ["Ox<Esc>", "a\n|b", "a\n|x\nb"], ["ixjk", "|a", "|xa"],
  ],
  edit: [
    ["x", "|abc", "|bc"], ["rx", "|abc", "|xbc"], ["dd", "a\n|b\nc", "a\n|c"], ["yyp", "|a\nb", "a\n|a\nb"],
    ["ccx<Esc>", "a\n|bc\nd", "a\n|x\nd"], ["D", "a|bc", "|a"], ["Cx<Esc>", "a|bc", "a|x"],
    ["xp", "|ab", "b|a"], ["xP", "ab|c", "a|cb"], ["xu", "|abc", "|abc"], ["xu<C-r>", "|abc", "|bc"],
    ["x.", "|abc", "|c"], ["J", "|a\nb", "a| b"], [">>", "|a", "  |a"], ["<<", "  |a", "|a"], ["~", "|ab", "A|b"],
  ],
  operators: [
    ["dw", "|foo bar", "|bar"], ["c$x<Esc>", "a|bc", "a|x"], ["d}", "|a\nb\n\nc", "|\nc"], ["dG", "a\n|b\nc", "|a"],
    ["3dd", "|a\nb\nc\nd", "|d"], ["5j", "|1\n2\n3\n4\n5\n6\n7", "1\n2\n3\n4\n5\n|6\n7"], ["d2w", "|a b c", "|c"],
    ["y$P", "|ab", "a|bab"],
  ],
  textObjects: [
    ["diw", "foo b|ar baz", "foo | baz"], ["daw", "foo b|ar baz", "foo |baz"],
    ['di"', 'x "a|b" y', 'x "|" y'], ['da"', 'x "a|b" y', "x |y"], ["di'", "x 'a|b' y", "x '|' y"], ["da'", "x 'a|b' y", "x |y"],
    ["di(", "f(a|b)", "f(|)"], ["da(", "f(a|b)", "|f"], ["di{", "{a|b}", "{|}"], ["da{", "x{a|b}", "|x"],
    ["di[", "[a|b]", "[|]"], ["da[", "x[a|b]", "|x"],
    ["dit", "<b>a|b</b>", "<b>|</b>"], ["dat", "x<b>a|b</b>y", "x|y"],
    ["dip", "a\n|b\n\nc", "|\nc"], ["dap", "a\n|b\n\nc", "|c"],
  ],
  visual: [
    ["vld", "|abc", "|c"], ["Vd", "a\n|b\nc", "a\n|c"], ["<C-v>jd", "|ab\ncd", "|b\nd"], ["vlohd", "a|bcd", "|d"],
    ["<C-v>jIx<Esc>", "|ab\ncd", "xab\nxcd"], ["<C-v>jAx<Esc>", "|ab\ncd", "axb\ncxd"],
  ],
  // "+y/"+p go through navigator.clipboard, which headless WebKit denies: manual checklist.
  registers: [['"ayyj"ap', "|a\nb", "a\nb\n|a"], ['yyjdd"0p', "|a\nb", "a\n|a"]],
  macros: [["qaxq@a@@", "|abcd", "|d"]],
  marks: [["maj'a", "a\n|b\nc", "a\n|b\nc"], ["G<C-o>", "|a\nb\nc", "|a\nb\nc"], ["G<C-o><C-i>", "|a\nb\nc", "a\nb\n|c"]],
  ex: [[":s/a/b/<CR>", "|a a", "b a"], [":%s/a/b/g<CR>", "a\na a", "b\nb b"], [":2<CR>", "|a\nb\nc", "a\n|b\nc"]],
};

// Known gaps of codemirror-vim, documented in docs/01-research.md (Vim core list). test.fails keeps them honest:
// if a gap gets fixed upstream, the test turns red and the list gets updated.
const gaps = new Set<string>([
  "xP", "y$P", // P leaves the cursor one past the pasted text, vim puts it on the last pasted char
  "d}", // exclusive motion ending in column 0 doesn't turn linewise (:h exclusive-linewise), leaves an empty line
  "dG", // deleting to the end leaves an empty last line instead of removing it
  'da"', "da'", // a" / a' don't take the trailing whitespace
  "dit", "dat", // no tag text objects
]);

for (const [group, cases] of Object.entries(groups)) {
  describe(group, () => {
    for (const [keys, start, want] of cases) {
      (gaps.has(keys) ? test.fails : test)(`${keys}  ${JSON.stringify(start)}`, async () => {
        const v = await run(start, keys);
        await vi.waitFor(() => expect(shown(v, want.includes("|"))).toBe(want), { timeout: 500 });
      });
    }
  });
}

describe("folds", () => {
  const src = "|function f() {\n  a\n}\nfunction g() {\n  b\n}";
  const folded = (v: EditorView) => foldedRanges(v.state).size;
  for (const [keys, n] of [["za", 1], ["zazo", 0], ["zc", 1], ["zMzR", 0], ["zM", 2]] as const) {
    (gaps.has(keys) ? test.fails : test)(keys, async () => {
      const v = await run(src, keys, [javascript()]);
      expect(folded(v)).toBe(n);
    });
  }
});

describe("viewport", () => {
  const long = "|" + Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
  const line = (v: EditorView) => v.state.doc.lineAt(v.state.selection.main.head).number;
  // CM6 measures and scrolls in the next frame, so the keys need a pause between them.
  const settle = () => new Promise((r) => setTimeout(r, 50));
  const press = async (keys: string) => { await userEvent.keyboard(toUserEvent(keys)); await settle(); };
  test("<C-d> <C-u>", async () => {
    const v = mount(long);
    await settle();
    await press("<C-d>");
    expect(line(v)).toBeGreaterThan(1);
    // From the end, not back to the top: if <C-d> didn't scroll (font metrics differ per OS), <C-u> has nothing to undo.
    await press("G");
    await press("<C-u>");
    expect(line(v)).toBeLessThan(100);
    expect(line(v)).toBeGreaterThan(80);
  });
  test("H M L", async () => {
    const v = mount(long);
    await settle();
    await press("L");
    const last = line(v);
    expect(last).toBeGreaterThan(3);
    await press("M");
    expect(line(v)).toBeGreaterThan(1);
    expect(line(v)).toBeLessThan(last);
    await press("H");
    expect(line(v)).toBe(1);
  });
  test("zz centers the cursor line", async () => {
    const v = mount(long);
    await settle();
    await press("50G");
    await press("zz");
    const top = v.lineBlockAt(v.state.selection.main.head).top - v.scrollDOM.scrollTop;
    expect(Math.abs(top - v.scrollDOM.clientHeight / 2)).toBeLessThan(v.defaultLineHeight * 2);
  });
});

describe("ex commands reach the host", () => {
  test.each([
    [":w<CR>", "write(false)"], [":w!<CR>", "write(true)"], [":q<CR>", "quit(false)"], [":q!<CR>", "quit(true)"],
    [":wq<CR>", "write(false) quit(false)"], [":e src/a.go<CR>", "edit(src/a.go,false)"], [":e!<CR>", "edit(,true)"],
    [" e", "focusTree"],
  ])("%s", async (keys, want) => {
    const calls: string[] = [];
    const host: VimHost = {
      write: async (f) => (calls.push(`write(${f})`), true),
      quit: async (f) => void calls.push(`quit(${f})`),
      edit: async (p, f) => void calls.push(`edit(${p},${f})`),
      focusTree: () => void calls.push("focusTree"),
    };
    installVim(host);
    await run("|a", keys);
    await vi.waitFor(() => expect(calls.join(" ")).toBe(want), { timeout: 500 });
  });
});
