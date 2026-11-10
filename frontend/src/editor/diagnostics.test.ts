import { expect, test } from "vitest";
import { DiagStore } from "./diagnostics";

const d = (line: number, severity: number, message = "m") => ({ range: { start: { line, character: 0 } }, severity, message });

test("a list replaces the URI's earlier one, an empty list clears it", () => {
  const s = new DiagStore();
  let calls = 0;
  s.onChange(() => calls++);
  s.publish({ uri: "file:///a", diagnostics: [d(1, 1), d(2, 2)] });
  s.publish({ uri: "file:///b", diagnostics: [d(0, 2)] });
  expect(s.counts()).toEqual({ errors: 1, warnings: 2 });
  s.publish({ uri: "file:///a", diagnostics: [d(5, 2)] });
  expect(s.counts()).toEqual({ errors: 0, warnings: 2 });
  s.publish({ uri: "file:///a", diagnostics: [] });
  s.publish({ uri: "file:///gone", diagnostics: [] }); // nothing to clear: no event
  expect(s.counts()).toEqual({ errors: 0, warnings: 1 });
  expect(calls).toBe(4);
});

test("errors come first, then file and line; no severity counts as an error", () => {
  const s = new DiagStore();
  s.publish({ uri: "file:///b", diagnostics: [d(3, 2), { range: { start: { line: 9, character: 0 } }, message: "x" }] });
  s.publish({ uri: "file:///a", diagnostics: [d(7, 1), d(1, 4)] });
  expect(s.all().map((x) => `${x.uri.slice(8)}:${x.line}:${x.severity}`)).toEqual(["a:7:1", "b:9:1", "b:3:2", "a:1:4"]);
});
