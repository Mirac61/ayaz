import { expect, test } from "vitest";
import { applyEdits, decodeTokens, tokenClass } from "./semantic-tokens";

const legend = { tokenTypes: ["namespace", "type", "function", "variable"], tokenModifiers: ["declaration", "readonly", "defaultLibrary"] };

test("relative numbers become lines and columns", () => {
  // line 0: `fmt` namespace at 0, `Println` function at 4; line 2: `x` variable (declaration, readonly) at 8
  const data = [0, 0, 3, 0, 0, 0, 4, 7, 2, 4, 2, 8, 1, 3, 3];
  expect(decodeTokens(data, legend)).toEqual([
    { line: 0, start: 0, length: 3, type: "namespace", modifiers: [] },
    { line: 0, start: 4, length: 7, type: "function", modifiers: ["defaultLibrary"] },
    { line: 2, start: 8, length: 1, type: "variable", modifiers: ["declaration", "readonly"] },
  ]);
});

test("a type the legend doesn't have gives an empty type, a short tail is ignored", () => {
  expect(decodeTokens([0, 0, 1, 9, 0], legend)[0].type).toBe("");
  expect(decodeTokens([0, 0, 1, 1], legend)).toEqual([]);
});

test("delta edits replace, insert and delete ranges of the old data", () => {
  const old = [0, 0, 3, 0, 0, 1, 0, 3, 1, 0, 1, 0, 3, 2, 0];
  expect(applyEdits(old, [{ start: 5, deleteCount: 5 }])).toEqual([0, 0, 3, 0, 0, 1, 0, 3, 2, 0]);
  expect(applyEdits(old, [{ start: 5, deleteCount: 0, data: [9, 9, 9, 9, 9] }])).toHaveLength(20);
  // out of order and two edits: each start refers to the old data
  expect(applyEdits([1, 2, 3, 4], [{ start: 3, deleteCount: 1, data: [8] }, { start: 0, deleteCount: 1, data: [7, 7] }]))
    .toEqual([7, 7, 2, 3, 8]);
});

test("the class names the type and the modifiers that matter", () => {
  expect(tokenClass({ line: 0, start: 0, length: 1, type: "variable", modifiers: ["declaration", "readonly"] }))
    .toBe("cm-sem-variable cm-sem-readonly");
});
