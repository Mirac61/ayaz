import { extOf } from "../lang/registry";
import { applyTheme, DEFAULT_THEME, parseThemeSpecs, resolveTheme, themeNames, type ThemeSpec } from "../theme/themes";

// settings.json next to keymap.json. Read at start and again whenever it is saved (like the keymap).
// "languages" is keyed by file extension ("go", "md", "ts") and overrides the global values for those files:
//   { "font": "JetBrains Mono", "fontSize": 14, "tabWidth": 4, "languages": { "ts": { "tabWidth": 2 } } }

export interface FileSettings {
  tabWidth: number; // shown width of a tab, and the indent unless tabs is on
  tabs: boolean; // indent with tabs
  wrap: boolean; // line wrap until <Space>uw toggles it
  formatOnSave: boolean; // through the language server
}

export interface Settings extends FileSettings {
  font: string; // put in front of the built-in monospace fonts, which stay as fallbacks (Nerd Font glyphs)
  fontSize: number; // editor and terminal, in px
  terminalFontSize?: number; // the terminal's own, if it should differ from fontSize
  inlayHints: boolean; // parameter names and types from the language server, inline
  semanticTokens: boolean; // the language server's token types colour the code over the syntax highlighting
  stickyScroll: boolean; // the functions and classes that scrolled out of view stay on top
  sidebar: "left" | "right"; // the file tree's side of the window
  statusline: "top" | "bottom"; // mode, messages and meta in the title bar, or in their own line under the code
  markdownSkin: "github" | "kairo"; // the look of the rendered Markdown view (<Space>um cycles it)
  glass?: boolean; // optional translucent chrome/overlays; solid is the default
  glassOpacity: number; // 0.3 (see-through) to 1: how much of the glass surfaces' colour is left
  theme: string; // a built-in theme (see theme/themes.ts) or one of "themes"
  themes: Record<string, ThemeSpec>; // your own, each on top of another ("extends"), by name
  statusColors: Partial<Record<StatusColor, string>>; // hex colors over tokens.css --status-*
  tasks: Record<string, string>; // name → shell command, run with <Space>rr in the folder
  languages: Record<string, Partial<FileSettings>>;
}

export const STATUS_COLORS = ["normal", "insert", "visual", "replace", "terminal", "read", "view", "error", "warning"] as const;
export type StatusColor = (typeof STATUS_COLORS)[number];

export const DEFAULTS: Settings = {
  font: "",
  fontSize: 13,
  inlayHints: false,
  semanticTokens: true,
  stickyScroll: true,
  sidebar: "left",
  statusline: "top",
  markdownSkin: "github",
  glassOpacity: 1,
  theme: DEFAULT_THEME,
  themes: {},
  statusColors: {},
  tasks: {},
  tabWidth: 4,
  tabs: false,
  wrap: false,
  formatOnSave: false,
  languages: { go: { tabs: true, formatOnSave: true }, md: { wrap: true } },
};

const TYPES: Record<keyof FileSettings, string> = { tabWidth: "number", tabs: "boolean", wrap: "boolean", formatOnSave: "boolean" };

function checkFile(o: Record<string, unknown>, where: string) {
  for (const [k, v] of Object.entries(o)) {
    const t = TYPES[k as keyof FileSettings];
    if (!t) throw new Error(`${where}: unknown setting "${k}"`);
    if (typeof v !== t) throw new Error(`${where}: "${k}" must be a ${t}`);
    if (k === "tabWidth" && !(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 16)) {
      throw new Error(`${where}: "tabWidth" must be a whole number from 1 to 16`);
    }
  }
}

// settings.json and keymap.json may hold // and /* */ comments and trailing commas, like VS Code's. Strips them.
export function stripJsonc(text: string): string {
  return strip(strip(text, false), true);
}

// One pass: comments, or (once they are gone) trailing commas.
function strip(text: string, commas: boolean): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (commas) {
      if (c !== "," || !/^\s*[}\]]/.test(text.slice(i + 1, i + 200))) out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i + 1 < text.length && text[i + 1] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else out += c;
  }
  return out;
}

// Checks settings.json; returns the settings on top of the defaults or throws with a message for the status line.
export function parseSettings(json: string): Settings {
  let data: unknown;
  try {
    data = JSON.parse(stripJsonc(json));
  } catch (e) {
    throw new Error(`settings.json: ${e instanceof Error ? e.message : e}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("settings.json: expected an object");
  const {
    font, fontSize, terminalFontSize, inlayHints, semanticTokens, stickyScroll,
    sidebar, statusline, markdownSkin, glass, glassOpacity, theme, themes, statusColors, tasks, languages, ...file
  } = data as Record<string, unknown>;
  if (font !== undefined && typeof font !== "string") throw new Error('settings.json: "font" must be a string');
  if (inlayHints !== undefined && typeof inlayHints !== "boolean") throw new Error('settings.json: "inlayHints" must be a boolean');
  for (const [name, v] of Object.entries({ semanticTokens, stickyScroll, glass })) {
    if (v !== undefined && typeof v !== "boolean") throw new Error(`settings.json: "${name}" must be a boolean`);
  }
  if (glassOpacity !== undefined && (typeof glassOpacity !== "number" || glassOpacity < 0.3 || glassOpacity > 1)) {
    throw new Error('settings.json: "glassOpacity" must be a number from 0.3 to 1');
  }
  if (sidebar !== undefined && sidebar !== "left" && sidebar !== "right") {
    throw new Error('settings.json: "sidebar" must be "left" or "right"');
  }
  if (statusline !== undefined && statusline !== "top" && statusline !== "bottom") {
    throw new Error('settings.json: "statusline" must be "top" or "bottom"');
  }
  if (markdownSkin !== undefined && markdownSkin !== "github" && markdownSkin !== "kairo") {
    throw new Error('settings.json: "markdownSkin" must be "github" or "kairo"');
  }
  if (theme !== undefined && typeof theme !== "string") throw new Error('settings.json: "theme" must be a theme name');
  const specs = themes === undefined ? {} : parseThemeSpecs(themes);
  resolveTheme((theme as string | undefined) ?? DEFAULT_THEME, specs); // an unknown theme or a circle fails here
  for (const name of Object.keys(specs)) resolveTheme(name, specs);
  if (statusColors !== undefined) {
    if (!statusColors || typeof statusColors !== "object" || Array.isArray(statusColors)) {
      throw new Error('settings.json: "statusColors" must be an object');
    }
    for (const [k, v] of Object.entries(statusColors)) {
      if (!(STATUS_COLORS as readonly string[]).includes(k)) {
        throw new Error(`settings.json: unknown status color "${k}", one of ${STATUS_COLORS.join(", ")}`);
      }
      if (typeof v !== "string" || !/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) {
        throw new Error(`settings.json: statusColors.${k} must be a hex color like "#7e9cd8"`);
      }
    }
  }
  if (tasks !== undefined) {
    if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
      throw new Error('settings.json: "tasks" must be an object of name → command');
    }
    for (const [k, v] of Object.entries(tasks)) {
      if (typeof v !== "string") throw new Error(`settings.json: tasks.${k} must be a command (a string)`);
    }
  }
  for (const [k, v] of Object.entries({ fontSize, terminalFontSize })) {
    if (v !== undefined && !(typeof v === "number" && v >= 6 && v <= 48)) {
      throw new Error(`settings.json: "${k}" must be a number from 6 to 48`);
    }
  }
  checkFile(file, "settings.json");
  if (languages !== undefined && (!languages || typeof languages !== "object" || Array.isArray(languages))) {
    throw new Error('settings.json: "languages" must be an object keyed by file extension');
  }
  const langs: Record<string, Partial<FileSettings>> = { ...DEFAULTS.languages };
  for (const [ext, o] of Object.entries((languages ?? {}) as Record<string, unknown>)) {
    if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error(`settings.json: languages.${ext} must be an object`);
    checkFile(o as Record<string, unknown>, `settings.json languages.${ext}`);
    langs[ext.toLowerCase()] = { ...langs[ext.toLowerCase()], ...o };
  }
  return {
    ...DEFAULTS, ...(file as Partial<FileSettings>),
    ...(font !== undefined && { font }), ...(fontSize !== undefined && { fontSize: fontSize as number }), // checked above
    ...(terminalFontSize !== undefined && { terminalFontSize: terminalFontSize as number }),
    ...(inlayHints !== undefined && { inlayHints }), ...(semanticTokens !== undefined && { semanticTokens: semanticTokens as boolean }), // checked above
    ...(stickyScroll !== undefined && { stickyScroll: stickyScroll as boolean }),
    ...(sidebar !== undefined && { sidebar }),
    ...(statusline !== undefined && { statusline }),
    ...(markdownSkin !== undefined && { markdownSkin }),
    ...(glass !== undefined && { glass: glass as boolean }),
    ...(glassOpacity !== undefined && { glassOpacity: glassOpacity as number }),
    ...(theme !== undefined && { theme: theme as string }), // checked above
    themes: specs,
    ...(statusColors !== undefined && { statusColors: statusColors as Settings["statusColors"] }), // checked above
    ...(tasks !== undefined && { tasks: tasks as Settings["tasks"] }), // checked above
    languages: langs,
  };
}

let current = DEFAULTS;
let problem = "";
let glassOverride: boolean | null = null; // the transparency command
let override = ""; // a theme picked with the theme command: kept until settings.json names another one
let fileTheme = DEFAULTS.theme;

export const settings = () => current;
export const settingsError = () => problem; // why settings.json was ignored, "" if it wasn't
export const themeName = () => override || current.theme;
// Glass is on when the command said so, else as settings.json has it.
export const glassOn = () => glassOverride ?? !!current.glass;
export const availableThemes = () => themeNames(current.themes);

// Puts the theme on the page, then the colors of "statusColors" over it.
function paintTheme() {
  applyTheme(resolveTheme(themeName(), current.themes), glassOn());
  document.documentElement.toggleAttribute("data-glass", glassOn());
  const root = document.documentElement.style;
  for (const k of STATUS_COLORS) {
    const c = current.statusColors[k];
    if (c) root.setProperty(`--status-${k}`, c);
  }
}

// The transparency command: on or off until settings.json is read again. Returns the new state.
export function toggleGlass(): boolean {
  glassOverride = !glassOn();
  paintTheme();
  return glassOverride;
}

// The theme command: this theme until settings.json names another one. Returns false for an unknown name.
export function setThemeOverride(name: string): boolean {
  if (!availableThemes().includes(name)) return false;
  override = name;
  paintTheme();
  return true;
}

// The settings for one file: its language's values over the global ones.
export function fileSettings(path: string | null, s = current): FileSettings {
  const l = path ? s.languages[extOf(path)] : undefined;
  return { tabWidth: s.tabWidth, tabs: s.tabs, wrap: s.wrap, formatOnSave: s.formatOnSave, ...l };
}

// Takes settings.json's text ("" for none); a broken file keeps what was there (the defaults at start) and settingsError says why.
export function loadSettings(text: string) {
  try {
    current = text.trim() ? parseSettings(text) : DEFAULTS;
    problem = "";
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }
  const root = document.documentElement.style;
  glassOverride = null;
  root.setProperty("--glass", String(current.glassOpacity));
  root.setProperty("--editor-font-size", `${current.fontSize}px`);
  root.removeProperty("--font-mono"); // back to the stylesheet's stack, so a reload doesn't stack fonts
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono");
  if (current.font) root.setProperty("--font-mono", `"${current.font}", ${mono}`);
  if (current.theme !== fileTheme) override = "";
  fileTheme = current.theme;
  paintTheme();
}
