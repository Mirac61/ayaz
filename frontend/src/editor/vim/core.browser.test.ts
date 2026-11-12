import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { foldedRanges } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { editorExtensions } from "../editor";
import { installVim } from "./setup";
import { defaultKeymap } from "../../core/keymap";

// Vim core list (04-testing, Q20): real key presses into a real editor in WebKit.
// "|" in start/want marks the cursor. A want without "|" checks only the text.

// The real setup: jk, leader, folds, default keymap. Ex tests below swap in a recording runner.
const primed: string[] = [];
const normal = defaultKeymap().filter((b) => b.context === "normal");
installVim(() => {}, normal, (k) => void primed.push(k));

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
  keys.replace(/<(Esc|CR|BS|C-(.))>|([{[])/g, (_, k, ctrl, lit) =>
    lit ? lit + lit : ctrl ? `{Control>}${ctrl}{/Control}` : k === "Esc" ? "{Escape}" : k === "BS" ? "{Backspace}" : "{Enter}");

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
    ["fc,", "abc|abc", "ab|cabc"], // ";" is ":" in my keymap, so only "," repeats ["%", "|(a)", "(a|)"],
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
  // M24: brackets close themselves, gc comments (CM6's toggleLineComment), surround like nvim-surround.
  basics: [
    ["i(x<Esc>", "|", "(x)"], ['i"<Esc>', "|", '""'], ["i(<BS><Esc>", "|a", "a"],
    ["ysiw)", "f|oo bar", "(foo) bar"], ["ysiw(", "f|oo", "( foo )"], ['ysiw"', "f|oo", '"foo"'], ["yss]", "  |a b", "  [a b]"],
    ["ds(", "f(a|b)", "fab"], ["ds(", "f( a|b )", "fab"], ['ds"', 'x "a|b" y', "x ab y"], ["ds)", "((a)|)", "(a)"],
    ['cs"\'', 'x "a|b"', "x 'ab'"], ["cs({", "(a|b)", "{ ab }"], ["vlS)", "|ab c", "(ab) c"],
    // M40: . repeats a surround with the same characters.
    ["ysiw)W.", "f|oo bar", "(foo) (bar)"], ["ds(j.", "(a|)\n(b)", "a\nb"], ["cs\"'j.", '"a|"\n"b"', "'a'\n'b'"],
    ["yss]j.", "|a\nb", "[a]\n[b]"],
  ],
  ex: [[":s/a/b/<CR>", "|a a", "b a"], [":%s/a/b/g<CR>", "a\na a", "b\nb b"], [":2<CR>", "|a\nb\nc", "a\n|b\nc"]],
};

// M63: the daily nvim commands that weren't in the list above. Gaps found here are in `gaps` below.
const fidelity: Case[] = [
  // :g and :v with commands, :normal, ranges on :s and :d
  [":g/a/d<CR>", "a1\nb\na2\nc", "b\nc"], [":v/a/d<CR>", "a1\nb\na2\nc", "a1\na2"],
  [":g/a/s/$/!/<CR>", "a1\nb\na2", "a1!\nb\na2!"], [":g/a/normal Ax<CR>", "a1\nb\na2", "a1x\nb\na2x"],
  [":%normal Ax<CR>", "a\nb", "ax\nbx"], [":2,3normal Ax<CR>", "a\nb\nc\nd", "a\nbx\ncx\nd"],
  [":2,3s/./X/<CR>", "aa\nbb\ncc\ndd", "aa\nXb\nXc\ndd"], [":2,3d<CR>", "a\nb\nc\nd", "a\nd"],
  [":%s/a/b/g<CR>", "a a\na", "b b\nb"], [":s/a/b/g<CR>", "a a\na", "b b\na"], [":.,+1s/a/X/<CR>", "a\na\na", "X\nX\na"],
  [":%s/(a)(b)/$2$1/<CR>", "ab ab", "ba ab"], [":%s/(a)(b)/\\2\\1/<CR>", "ab ab", "ba ab"],
  [":%s/\\(a\\)\\(b\\)/\\2\\1/<CR>", "ab ab", "ba ab"], [":m 2<CR>", "|a\nb\nc", "b\n|a\nc"], [":%s/a/b/gc<CR>yn", "a a", "b a"],
  [":m0<CR>", "a\n|b", "|b\na"], [":t.<CR>", "|a\nb", "a\n|a\nb"], [":><CR>", "|a", "  |a"], [":m+1<CR>", "|a\nb\nc", "b\n|a\nc"],
  [":1,2m$<CR>", "|a\nb\nc", "c\na\n|b"], [":t0<CR>", "a\n|b", "|b\na\nb"], [":2,3t0<CR>", "a\nb\n|c", "b\n|c\na\nb\nc"],
  [":1,2><CR>", "|a\nb\nc", "  a\n  b\nc"], [":<<CR>", "  |a", "|a"], [":m$<CR>", "|a\nb", "b\n|a"],
  // macros over lines, counts
    ["qaA!<Esc>jq3@a", "|a\nb\nc\nd\ne", "a!\nb!\nc!\nd!\ne"],
  ["qaA!<Esc>jq:2,4normal @a<CR>", "|a\nb\nc\nd\ne", "a!\nb!\nc!\nd!\ne"],
  ["qqxq@q@@", "|abcd", "|d"],
  // registers: named, append, black hole, numbered, yank register 0
  ['"ayy"Ayyj"ap', "|a\nb", "a\nb\na\na"], ['yyj"_ddp', "|a\nb", "a\n|a"], ['yyjdd"0p', "|a\nb", "a\n|a"],
  ['"ayiwj"bdd"ap', "|foo\nbar", "ffoooo"],
  // visual: gv, o, block insert/append, visual line operators, a visual selection with . repeat
    ["vly<Esc>gvd", "|abc", "|c"], ["vlohd", "a|bcd", "|d"], ["<C-v>jlc!<Esc>", "|ab\ncd", "!\n!"],
  ["<C-v>j$Ax<Esc>", "|a\nbb", "ax\nbbx"],
    ["Vjd", "|a\nb\nc", "c"], ["Vj>", "|a\nb", "  a\n  b"], ["vjJ", "|a\nb", "a b"], ["vi(y$p", "f(|ab)", "f(ab)ab"],
  ["viwUw.", "|ab cd", "AB CD"],
  // search and word motions
    ["*", "|foo x foo", "foo x |foo"], ["#", "foo x |foo", "|foo x foo"], ["g*", "|foo foobar", "foo |foobar"],
  ["/b<CR>nN", "|a b b", "a |b b"],
  [":noh<CR>", "|a", "|a"],
  // text object variants and counts
    ["ci(x<Esc>", "f(|a, b)", "f(x)"], ["ca[x<Esc>", "g[|a]", "gx"], ["d2aw", "|a b c d", "|c d"],
  ["yiwwviwp", "|a b", "a |a"], ["dis", "One. T|wo. Three.", "One.  Three."],
  // misc nvim habits
    ["ddp", "|a\nb", "b\n|a"], ["xp", "|ab", "b|a"], ["~~", "|ab", "AB"], ["gUiw", "|ab cd", "|AB cd"], ["guu", "|AB", "|ab"],
  ["g~~", "|aB", "|Ab"],
    ["J", "|a\n  b", "a| b"], ["gJ", "|a\nb", "a|b"], ["3x", "|abcd", "|d"], ["r<CR>", "a|b", "a\n|"], ["ZZ", "|a", "|a"],
  ["==", "|a", "|a"],
    ["o<Esc>", "|a", "a\n|"], ["yyP", "|a", "|a\na"], ["Yp", "|a\nb", "a\n|a\nb"], ["cwx<Esc>w.", "|a a", "x x"],
  ["ct,x<Esc>", "|ab, c", "|x, c"],
    ["%", "|(a)", "(a|)"], ["di<", "<|a>", "<>"], ["dt)", "f(|ab)", "f()"], ["d/c<CR>", "|ab c", "|c"], ["dgg", "a\n|b", "|"],
  ["d$", "a|bc", "|a"],
    ["zz", "|a", "|a"], ["m'", "|a", "|a"], ["gg=G", "|a\nb", "a\nb"], ["<C-a>", "|x 5", "x |6"], ["<C-x>", "|x 5", "x |4"],
  ["5<C-a>", "|x 5", "x 1|0"],
  ["gi", "|a", "|a"], ["g;", "|a", "|a"],
];

// Known gaps of codemirror-vim, documented in docs/01-research.md (Vim core list). test.fails keeps them honest:
// if a gap gets fixed upstream, the test turns red and the list gets updated.
const gaps = new Set<string>([
  "xP", "y$P", // P leaves the cursor one past the pasted text, vim puts it on the last pasted char
  "d}", // exclusive motion ending in column 0 doesn't turn linewise (:h exclusive-linewise), leaves an empty line
  "dG", // deleting to the end leaves an empty last line instead of removing it
  'da"', "da'", // a" / a' don't take the trailing whitespace
  "dit", "dat", // no tag text objects
  ":%s/(a)(b)/\\2\\1/<CR>", // a replacement has $1 and $2 (JavaScript's), not vim's \1 and \2
  // patterns are JavaScript's: \( is a literal paren and groups are plain (...), vim's "magic" has it the other way round
  ":%s/\\(a\\)\\(b\\)/\\2\\1/<CR>",
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

describe("comments", () => {
  for (const [keys, start, want] of [
    ["gcc", "|a = 1", "// a = 1"], ["gcj", "|a\nb", "// a\n// b"], ["Vjgc", "|a\nb", "// a\n// b"], ["gccgcc", "|a", "a"],
  ]) {
    test(keys, async () => {
      const v = await run(start, keys, [javascript()]);
      await vi.waitFor(() => expect(shown(v, false)).toBe(want), { timeout: 500 });
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

describe("ex commands and leader keys run commands", () => {
  test.each([
    [":w<CR>", "file.save()"], [":w!<CR>", "file.save(!)"], [":q<CR>", "pane.close()"], [":q!<CR>", "pane.close(!)"],
    [":qa<CR>", "app.quit()"], [":qa!<CR>", "app.quit(!)"],
    [":wq<CR>", "file.saveClose()"], [":e src/a.go<CR>", "file.open(src/a.go)"], [":e!<CR>", "file.open(!)"],
    [":sp<CR>", "pane.splitDown()"], [":vs<CR>", "pane.splitRight()"], [";w<CR>", "file.save()"],
    [" e", "prime(<Space>e)"], [" ff", "find.files()"], [" fk", "find.commands()"],
    [":terminal<CR>", "term.split()"], [" t", "prime(<Space>t)"], [" gg", "term.lazygit()"],
    ["<C-w>v", "pane.splitRight()"], ["<C-w>l", "pane.right()"], ["<C-h>", "pane.left()"], ["<C-j>", "pane.down()"],
  ])("%s", async (keys, want) => {
    const calls: string[] = [];
    installVim((id, arg) => void calls.push(`${id}(${arg ?? ""})`), normal, (k) => void calls.push(`prime(${k})`));
    await run("|a", keys);
    await vi.waitFor(() => expect(calls.join(" ")).toBe(want), { timeout: 500 });
  });
});

// M55: text objects and motions from the syntax tree (the grammar is a mounted extension, so each case names one).
describe("structural text objects", () => {
  const ts = javascript({ typescript: true });
  const FN = "function a() {\n  one();\n}\n\nfunction b(x, y|y, z) {\n  two(x);\n  return 1;\n}\n\nfunction c() {}\n";
  const cases: Case[] = [
    ["dif", FN, "function a() {\n  one();\n}\n\nfunction b(x, yy, z) {\n}\n\nfunction c() {}\n"],
    ["daf", FN, "function a() {\n  one();\n}\n\n\n\nfunction c() {}\n"],
    ["cifx<Esc>", "function a() {\n  o|ne();\n}\n", "function a() {\nx}\n"],
    ["daa", "f(a, b|b, c)", "f(a, c)"],
    ["dia", "f(a, b|b, c)", "f(a, , c)"],
    ["daa", "f(a, b, c|c)", "f(a, b)"],
    ["cia1<Esc>", "f(a, g(x, |y), c)", "f(a, g(x, 1), c)"],
    ["vafd", "x;\nfunction a() { |one() }\ny;", "x;\n\ny;"],
    ["]f", "|x;\nfunction a() {}\nfunction b() {}\n", "x;\n|function a() {}\nfunction b() {}\n"],
    ["]f]f", "|x;\nfunction a() {}\nfunction b() {}\n", "x;\nfunction a() {}\n|function b() {}\n"],
    ["[f", "function a() {}\nfunction b() {}\nx|;\n", "function a() {}\n|function b() {}\nx;\n"],
  ];
  for (const [keys, start, want] of cases) {
    test(`${keys}  ${JSON.stringify(start)}`, async () => {
      const v = await run(start, keys, [ts]);
      await vi.waitFor(() => expect(shown(v, want.includes("|"))).toBe(want), { timeout: 500 });
    });
  }

  test("+ grows the selection by syntax, - takes the last step back", async () => {
    const v = mount("function a() { call(ab|c, 1) }", [ts]);
    const sel = () => v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);
    await userEvent.keyboard("+");
    await vi.waitFor(() => expect(sel()).toBe("abc"));
    await userEvent.keyboard("+");
    await vi.waitFor(() => expect(sel()).toBe("(abc, 1)"));
    await userEvent.keyboard("+");
    await vi.waitFor(() => expect(sel()).toBe("call(abc, 1)"));
    await userEvent.keyboard("-");
    await vi.waitFor(() => expect(sel()).toBe("(abc, 1)"));
    await userEvent.keyboard("-");
    await vi.waitFor(() => expect(sel()).toBe("abc"));
    await userEvent.keyboard("d");
    await vi.waitFor(() => expect(v.state.doc.toString()).toBe("function a() { call(, 1) }"));
  });
});

describe("daily nvim commands (M63)", () => {
  for (const [keys, start, want] of fidelity) {
    (gaps.has(keys) ? test.fails : test)(`${keys}  ${JSON.stringify(start)}`, async () => {
      const v = await run(start, keys);
      await vi.waitFor(() => expect(shown(v, want.includes("|"))).toBe(want), { timeout: 500 });
    });
  }
});
