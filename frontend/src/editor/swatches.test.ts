import { expect, test } from "vitest";
import { hexColors, splitHex } from "./swatches";

test("finds hex colors of 3, 4, 6 and 8 digits", () => {
  expect(hexColors("a: #fff; b: #12345678, c: #1a2B3c; d: #abcd").map((c) => c.color)).toEqual(["#fff", "#12345678", "#1a2B3c", "#abcd"]);
});

test("ignores what only looks like one", () => {
  expect(hexColors("#define X\n#include <a>\n#abcdefg\n#12345\n#ab")).toEqual([]);
});

test("gives the offset of each color", () => {
  expect(hexColors("x #fff y #000")).toEqual([{ index: 2, color: "#fff" }, { index: 9, color: "#000" }]);
});

test("splitHex expands short forms and keeps alpha apart", () => {
  expect(splitHex("#fff")).toEqual({ rgb: "#ffffff", alpha: "" });
  expect(splitHex("#1A2b3c80")).toEqual({ rgb: "#1a2b3c", alpha: "80" });
  expect(splitHex("#f008")).toEqual({ rgb: "#ff0000", alpha: "88" });
});
