import { expect, test } from "vitest";
import { DEFAULTS, fileSettings, parseSettings } from "./settings";

test("defaults: Go indents with tabs and formats on save, Markdown wraps", () => {
  expect(fileSettings("a/main.go", DEFAULTS)).toEqual({ tabWidth: 4, tabs: true, wrap: false, formatOnSave: true });
  expect(fileSettings("README.md", DEFAULTS).wrap).toBe(true);
  expect(fileSettings("x.ts", DEFAULTS)).toEqual({ tabWidth: 4, tabs: false, wrap: false, formatOnSave: false });
  expect(fileSettings(null, DEFAULTS).tabWidth).toBe(4);
});

test("global values, then the language's on top; the built-in languages keep what isn't overridden", () => {
  const s = parseSettings(JSON.stringify({
    font: "Iosevka", fontSize: 15, tabWidth: 2, formatOnSave: true,
    languages: { go: { formatOnSave: false }, TS: { tabWidth: 8 } },
  }));
  expect(s.font).toBe("Iosevka");
  expect(s.fontSize).toBe(15);
  expect(fileSettings("a.go", s)).toEqual({ tabWidth: 2, tabs: true, wrap: false, formatOnSave: false });
  expect(fileSettings("a.ts", s)).toEqual({ tabWidth: 8, tabs: false, wrap: false, formatOnSave: true });
  expect(fileSettings("a.md", s).wrap).toBe(true);
  expect(parseSettings("{}")).toEqual(DEFAULTS);
});

test("mistakes are named", () => {
  expect(() => parseSettings("[]")).toThrow("expected an object");
  expect(() => parseSettings('{"tabwidth": 2}')).toThrow('unknown setting "tabwidth"');
  expect(() => parseSettings('{"tabWidth": 0}')).toThrow("1 to 16");
  expect(() => parseSettings('{"wrap": "yes"}')).toThrow('"wrap" must be a boolean');
  expect(() => parseSettings('{"fontSize": 100}')).toThrow("6 to 48");
  expect(() => parseSettings('{"languages": {"go": {"tabs": 1}}}')).toThrow("languages.go");
  expect(() => parseSettings("{")).toThrow();
});
