import { expect, test } from "vitest";
import { DEFAULTS, fileSettings, parseSettings } from "./settings";
import template from "../../../app/settings.default.json?raw";

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

test("a syntax error names the file", () => {
  expect(() => parseSettings("{ broken")).toThrow(/^settings\.json: /);
});

test("inlayHints: off by default, a boolean", () => {
  expect(DEFAULTS.inlayHints).toBe(false);
  expect(parseSettings('{"inlayHints": true}').inlayHints).toBe(true);
  expect(() => parseSettings('{"inlayHints": 1}')).toThrow(/"inlayHints" must be a boolean/);
});

test("terminalFontSize: optional, same range as fontSize", () => {
  expect(DEFAULTS.terminalFontSize).toBeUndefined();
  expect(parseSettings('{"terminalFontSize": 15}').terminalFontSize).toBe(15);
  expect(() => parseSettings('{"terminalFontSize": 99}')).toThrow(/"terminalFontSize" must be a number from 6 to 48/);
});

test("the file tree goes left or right", () => {
  expect(parseSettings('{"sidebar": "right"}').sidebar).toBe("right");
  expect(() => parseSettings('{"sidebar": "top"}')).toThrow('"sidebar" must be "left" or "right"');
});

test("the status line goes top or bottom, its colors are hex per key", () => {
  expect(parseSettings('{"statusline": "bottom"}').statusline).toBe("bottom");
  expect(() => parseSettings('{"statusline": "left"}')).toThrow('"statusline" must be "top" or "bottom"');
  expect(parseSettings('{"statusColors": {"insert": "#98bb6c"}}').statusColors).toEqual({ insert: "#98bb6c" });
  expect(() => parseSettings('{"statusColors": {"pink": "#fff"}}')).toThrow('unknown status color "pink"');
  expect(() => parseSettings('{"statusColors": {"normal": "blue"}}')).toThrow("statusColors.normal must be a hex color");
});

test("tasks: names to shell commands", () => {
  expect(parseSettings('{"tasks": {"vet": "go vet ./..."}}').tasks).toEqual({ vet: "go vet ./..." });
  expect(() => parseSettings('{"tasks": ["go vet"]}')).toThrow('"tasks" must be an object of name → command');
  expect(() => parseSettings('{"tasks": {"vet": 1}}')).toThrow('tasks.vet must be a command (a string)');
});

test("comments and trailing commas are allowed; strings keep their slashes and commas", () => {
  const s = parseSettings(`// top\n{ /* a */ "font": "a // b, }", // c\n "languages": { "ts": { "tabWidth": 2, }, }, }`);
  expect(s.font).toBe("a // b, }");
  expect(s.languages.ts).toEqual({ tabWidth: 2 });
});

test("the settings.json written for a new user is the defaults", () => {
  expect(parseSettings(template)).toEqual(DEFAULTS);
});
