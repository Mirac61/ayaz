import { expect, test } from "vitest";
import { formatBreakpointPrompt, parseBreakpointPrompt } from "./breakpoints";

test("parseBreakpointPrompt parses conditions, logpoints, hit conditions and empty text", () => {
  expect(parseBreakpointPrompt("i == 2")).toEqual({ condition: "i == 2" });
  expect(parseBreakpointPrompt("  x > 10 && y < 5  ")).toEqual({ condition: "x > 10 && y < 5" });
  expect(parseBreakpointPrompt("log: reached loop with i = {i}")).toEqual({ logMessage: "reached loop with i = {i}" });
  expect(parseBreakpointPrompt("LOG: simple message")).toEqual({ logMessage: "simple message" });
  expect(parseBreakpointPrompt("hits: 5")).toEqual({ hitCondition: "5" });
  expect(parseBreakpointPrompt("hit: >= 3")).toEqual({ hitCondition: ">= 3" });
  expect(parseBreakpointPrompt("")).toEqual({});
  expect(parseBreakpointPrompt("   ")).toEqual({});
  expect(parseBreakpointPrompt("log:")).toEqual({});
  expect(parseBreakpointPrompt("hits:")).toEqual({});
});

test("formatBreakpointPrompt formats breakpoints for prompt editing", () => {
  expect(formatBreakpointPrompt({ line: 1, condition: "i == 2" })).toBe("i == 2");
  expect(formatBreakpointPrompt({ line: 2, logMessage: "hello" })).toBe("log: hello");
  expect(formatBreakpointPrompt({ line: 3, hitCondition: "5" })).toBe("hits: 5");
  expect(formatBreakpointPrompt({ line: 4 })).toBe("");
});
