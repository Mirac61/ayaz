import { expect, test } from "vitest";
import { parseOsc7 } from "./osc";

test("OSC 7 gives the shell's folder", () => {
  expect(parseOsc7("file://mac.local/Users/me/code")).toBe("/Users/me/code");
  expect(parseOsc7("file:///Users/me/my%20project")).toBe("/Users/me/my project");
  expect(parseOsc7("file://mac.local/")).toBe("/");
});

test("anything that isn't a file URL or a clean path gives nothing", () => {
  expect(parseOsc7("")).toBe("");
  expect(parseOsc7("https://example.com/x")).toBe("");
  expect(parseOsc7("file://host/100%/done")).toBe("");
});
