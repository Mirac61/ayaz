import { extOf } from "../lang/registry";

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
  inlayHints: boolean; // parameter names and types from the language server, inline
  languages: Record<string, Partial<FileSettings>>;
}

export const DEFAULTS: Settings = {
  font: "",
  fontSize: 13,
  inlayHints: false,
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

// Checks settings.json; returns the settings on top of the defaults or throws with a message for the status line.
export function parseSettings(json: string): Settings {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new Error(`settings.json: ${e instanceof Error ? e.message : e}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("settings.json: expected an object");
  const { font, fontSize, inlayHints, languages, ...file } = data as Record<string, unknown>;
  if (font !== undefined && typeof font !== "string") throw new Error('settings.json: "font" must be a string');
  if (inlayHints !== undefined && typeof inlayHints !== "boolean") throw new Error('settings.json: "inlayHints" must be a boolean');
  if (fontSize !== undefined && !(typeof fontSize === "number" && fontSize >= 6 && fontSize <= 48)) {
    throw new Error('settings.json: "fontSize" must be a number from 6 to 48');
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
    ...(font !== undefined && { font }), ...(fontSize !== undefined && { fontSize }),
    ...(inlayHints !== undefined && { inlayHints }), languages: langs,
  };
}

let current = DEFAULTS;
let problem = "";

export const settings = () => current;
export const settingsError = () => problem; // why settings.json was ignored, "" if it wasn't

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
  root.setProperty("--editor-font-size", `${current.fontSize}px`);
  root.removeProperty("--font-mono"); // back to the stylesheet's stack, so a reload doesn't stack fonts
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono");
  if (current.font) root.setProperty("--font-mono", `"${current.font}", ${mono}`);
}
