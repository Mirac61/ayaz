import { expect, test } from "vitest";
import { parseSettings } from "../core/settings";
import {
  applyTheme,
  BUILTIN_THEMES,
  resolveTheme,
  SYNTAX_KEYS,
  TERMINAL_KEYS,
  terminalTheme,
  themeNames,
  UI_VARS,
  parseThemeSpecs,
} from "./themes";

test("every built-in theme names every ui and syntax color and the terminal's colors", () => {
  for (const [name, t] of Object.entries(BUILTIN_THEMES)) {
    expect(Object.keys(t.ui).sort(), name).toEqual(Object.keys(UI_VARS).sort());
    expect(Object.keys(t.syntax).sort(), name).toEqual([...SYNTAX_KEYS].sort());
    for (const k of TERMINAL_KEYS.filter((k) => k !== "background")) expect(t.terminal[k], `${name} ${k}`).toBeTruthy();
  }
});

test("a custom theme changes what it names and keeps the rest of its base", () => {
  const specs = parseThemeSpecs({
    mine: { extends: "kanagawa", ui: { bg0: "#000000" }, syntax: { keyword: "#ff0000" }, terminal: { red: "#00ff00" } },
  });
  const t = resolveTheme("mine", specs);
  expect(t.ui.bg0).toBe("#000000");
  expect(t.ui.bg1).toBe(BUILTIN_THEMES.kanagawa.ui.bg1);
  expect(t.syntax.keyword).toBe("#ff0000");
  expect(t.syntax.fn).toBe(BUILTIN_THEMES.kanagawa.syntax.fn);
  expect(t.terminal.red).toBe("#00ff00");
  expect(t.terminal.green).toBe(BUILTIN_THEMES.kanagawa.terminal.green);
});

test("a theme without extends sits on graphite; chains and same-name overrides work", () => {
  const specs = parseThemeSpecs({
    a: { ui: { fg1: "#111111" } },
    b: { extends: "a", ui: { fg2: "#222222" } },
    "tokyo-night": { ui: { bg0: "#010101" } },
  });
  expect(resolveTheme("a", specs).ui.bg0).toBe(BUILTIN_THEMES.graphite.ui.bg0);
  const b = resolveTheme("b", specs);
  expect(b.ui.fg1).toBe("#111111");
  expect(b.ui.fg2).toBe("#222222");
  const tn = resolveTheme("tokyo-night", specs);
  expect(tn.ui.bg0).toBe("#010101");
  expect(tn.ui.bg1).toBe(BUILTIN_THEMES["tokyo-night"].ui.bg1);
  expect(themeNames(specs)).toEqual(expect.arrayContaining(["graphite", "a", "b", "tokyo-night"]));
});

test("mistakes in themes are named", () => {
  expect(() => resolveTheme("nope")).toThrow('unknown theme "nope", one of graphite');
  expect(() => resolveTheme("a", parseThemeSpecs({ a: { extends: "b" }, b: { extends: "a" } }))).toThrow("in a circle");
  expect(() => parseThemeSpecs([])).toThrow('"themes" must be an object');
  expect(() => parseThemeSpecs({ a: { colors: {} } })).toThrow('unknown part "colors"');
  expect(() => parseThemeSpecs({ a: { ui: { bg9: "#000" } } })).toThrow('unknown color "bg9"');
  expect(() => parseThemeSpecs({ a: { ui: { bg0: "red" } } })).toThrow("themes.a.ui.bg0 must be a color");
  expect(() => parseThemeSpecs({ a: { extends: 1 } })).toThrow("extends must be a theme name");
});

test("settings.json: theme and themes are checked together", () => {
  expect(parseSettings("{}").theme).toBe("graphite");
  const s = parseSettings('{"theme": "mine", "themes": {"mine": {"extends": "gruvbox-dark"}}}');
  expect(s.theme).toBe("mine");
  expect(() => parseSettings('{"theme": "nope"}')).toThrow('unknown theme "nope"');
  expect(() => parseSettings('{"theme": 3}')).toThrow('"theme" must be a theme name');
  expect(() => parseSettings('{"themes": {"x": {"extends": "missing"}}}')).toThrow('unknown theme "missing"');
});

test("applyTheme sets the variables; with glass the translucent surfaces stay with the stylesheet", () => {
  const set = new Map<string, string>();
  const root = {
    setProperty: (k: string, v: string) => void set.set(k, v),
    removeProperty: (k: string) => void set.delete(k),
  } as unknown as CSSStyleDeclaration;
  const t = BUILTIN_THEMES["catppuccin-mocha"];
  applyTheme(t, false, root);
  expect(set.get("--bg-0")).toBe(t.ui.bg0);
  expect(set.get("--status-normal")).toBe(t.ui.statusNormal);
  expect(set.get("--syn-keyword")).toBe(t.syntax.keyword);
  expect(set.get("--syn-line-highlight")).toBe(t.syntax.lineHighlight);
  expect(terminalTheme().background).toBe(t.ui.bg1); // no terminal background: the pane's
  applyTheme(BUILTIN_THEMES.kanagawa, true, root);
  expect(set.has("--bg-0")).toBe(false);
  expect(set.get("--fg-1")).toBe(BUILTIN_THEMES.kanagawa.ui.fg1);
  expect(terminalTheme().background).toBe("#16171d");
});
