import { expect, test } from "vitest";
import { errText } from "./context";

test("errText reads an Error, a language server's {message} object, and anything else", () => {
  expect(errText(new Error("boom"))).toBe("boom");
  expect(errText({ code: -32601, message: "method not found" })).toBe("method not found");
  expect(errText("plain")).toBe("plain");
  expect(errText(null)).toBe("null");
});
