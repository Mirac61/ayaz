import type { ITheme } from "@xterm/xterm";

// A theme has three parts that one definition keeps together: the chrome (`ui`, CSS variables on :root, see
// tokens.css for the names), the editor's syntax colors (`syntax`, --syn-* variables the CodeMirror theme reads)
// and the terminal's 16 colors. settings.json picks one with "theme" and may define its own under "themes":
//   { "theme": "mine", "themes": { "mine": { "extends": "kanagawa", "ui": { "bg0": "#101014" } } } }

// UI key → CSS variable.
export const UI_VARS = {
  bg0: "--bg-0",
  bgSidebar: "--bg-sidebar",
  bgTabs: "--bg-tabs",
  tab: "--tab",
  tabActive: "--tab-active",
  bg1: "--bg-1",
  bg2: "--bg-2",
  bg3: "--bg-3",
  hover: "--hover",
  overlay: "--overlay",
  edge: "--edge",
  edgeSplit: "--edge-split",
  edgeOverlay: "--edge-overlay",
  fg1: "--fg-1",
  fg2: "--fg-2",
  fg3: "--fg-3",
  fg4: "--fg-4",
  accent: "--accent",
  insert: "--insert",
  visual: "--visual",
  error: "--error",
  warning: "--warning",
  gitAdd: "--git-add",
  gitMod: "--git-mod",
  gitDel: "--git-del",
  statusNormal: "--status-normal",
  statusInsert: "--status-insert",
  statusVisual: "--status-visual",
  statusReplace: "--status-replace",
  statusTerminal: "--status-terminal",
  statusRead: "--status-read",
  statusView: "--status-view",
  statusError: "--status-error",
  statusWarning: "--status-warning",
} as const;
export type UiColors = Record<keyof typeof UI_VARS, string>;

// Surfaces that data-glass (settings.json "glass") makes translucent from the stylesheet; a theme leaves them alone then.
const GLASS_SURFACES: (keyof UiColors)[] = ["bg0", "bgSidebar", "bgTabs", "tab", "tabActive", "bg1", "bg2", "overlay"];

export const SYNTAX_KEYS = [
  "fg",
  "comment",
  "keyword",
  "fn",
  "string",
  "number",
  "type",
  "constant",
  "operator",
  "punct",
  "special",
  "field",
  "param",
  "error",
  "cursor",
  "selection",
  "lineHighlight",
] as const;
export type SyntaxColors = Record<(typeof SYNTAX_KEYS)[number], string>;

export const TERMINAL_KEYS = [
  "background",
  "foreground",
  "cursor",
  "selectionBackground",
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;
// "background" may be left out: the terminal then takes the pane's color (ui.bg1).
export type TerminalColors = Partial<Record<(typeof TERMINAL_KEYS)[number], string>>;

export interface Theme {
  ui: UiColors;
  syntax: SyntaxColors;
  terminal: TerminalColors;
}

// What settings.json's "themes" may hold: a theme on top of another one (default graphite).
export interface ThemeSpec {
  extends?: string;
  ui?: Partial<UiColors>;
  syntax?: Partial<SyntaxColors>;
  terminal?: TerminalColors;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
export const synVar = (k: keyof SyntaxColors) => `--syn-${kebab(k)}`;

const KANAGAWA_SYNTAX: SyntaxColors = {
  fg: "#dcd7ba",
  comment: "#727169",
  keyword: "#957fb8",
  fn: "#7e9cd8",
  string: "#98bb6c",
  number: "#d27e99",
  type: "#7aa89f",
  constant: "#ffa066",
  operator: "#c0a36e",
  punct: "#9cabca",
  special: "#e6c384",
  field: "#e6c384",
  param: "#b8b4d0",
  error: "#e82424",
  cursor: "#dcd7ba",
  selection: "rgb(255 255 255 / 0.1)",
  lineHighlight: "rgb(255 255 255 / 0.05)",
};

// Kanagawa (wave) terminal colors, from kanagawa.nvim's terminal palette.
const KANAGAWA_TERMINAL: TerminalColors = {
  foreground: "#dcd7ba",
  cursor: "#dcd7ba",
  selectionBackground: "#ffffff1a",
  black: "#090618",
  red: "#c34043",
  green: "#76946a",
  yellow: "#c0a36e",
  blue: "#7e9cd8",
  magenta: "#957fb8",
  cyan: "#6a9589",
  white: "#c8c093",
  brightBlack: "#727169",
  brightRed: "#e82424",
  brightGreen: "#98bb6c",
  brightYellow: "#e6c384",
  brightBlue: "#7fb4ca",
  brightMagenta: "#938aa9",
  brightCyan: "#7aa89f",
  brightWhite: "#dcd7ba",
};

// Neutral graphite chrome with Kanagawa colors in the code and the terminal. The default.
const graphite: Theme = {
  ui: {
    bg0: "#161617",
    bgSidebar: "#161617",
    bgTabs: "#161617",
    tab: "transparent",
    tabActive: "#2a2a2d",
    bg1: "#161617",
    bg2: "#1b1b1d",
    bg3: "#3a3a3d",
    hover: "#2c2c2e",
    overlay: "#242426",
    edge: "rgb(255 255 255 / 0.09)",
    edgeSplit: "rgb(255 255 255 / 0.09)",
    edgeOverlay: "rgb(255 255 255 / 0.13)",
    fg1: "#f2f2f3",
    fg2: "#bcbcc1",
    fg3: "#a0a0a6",
    fg4: "#92929a",
    accent: "#7e9cd8",
    insert: "#98bb6c",
    visual: "#957fb8",
    error: "#e82424",
    warning: "#ff9e3b",
    gitAdd: "#76946a",
    gitMod: "#7e9cd8",
    gitDel: "#c34043",
    statusNormal: "#7e9cd8",
    statusInsert: "#98bb6c",
    statusVisual: "#957fb8",
    statusReplace: "#e46876",
    statusTerminal: "#c0a36e",
    statusRead: "#7aa89f",
    statusView: "#9cabca",
    statusError: "#e46876",
    statusWarning: "#dca561",
  },
  syntax: KANAGAWA_SYNTAX,
  terminal: KANAGAWA_TERMINAL,
};

const kanagawa: Theme = {
  ui: {
    ...graphite.ui,
    bg0: "#111217",
    bgSidebar: "#14151b",
    bgTabs: "#13141a",
    tabActive: "#252734",
    bg1: "#171820",
    bg2: "#1b1c25",
    bg3: "#2a2c3a",
    hover: "#1f212c",
    overlay: "#181922",
    edge: "rgb(220 215 186 / 0.1)",
    edgeSplit: "rgb(220 215 186 / 0.1)",
    edgeOverlay: "rgb(220 215 186 / 0.14)",
    fg1: "#dcd7ba",
    fg2: "#c2beaa",
    fg3: "#9a9a9e",
    fg4: "#8c8c98",
  },
  syntax: KANAGAWA_SYNTAX,
  terminal: { ...KANAGAWA_TERMINAL, background: "#16171d" },
};

const tokyoNight: Theme = {
  ui: {
    bg0: "#16161e",
    bgSidebar: "#16161e",
    bgTabs: "#16161e",
    tab: "transparent",
    tabActive: "#292e42",
    bg1: "#1a1b26",
    bg2: "#1f2133",
    bg3: "#3b4261",
    hover: "#24283b",
    overlay: "#1f2335",
    edge: "rgb(192 202 245 / 0.1)",
    edgeSplit: "rgb(192 202 245 / 0.1)",
    edgeOverlay: "rgb(192 202 245 / 0.14)",
    fg1: "#c0caf5",
    fg2: "#a9b1d6",
    fg3: "#9aa5ce",
    fg4: "#8b95c6",
    accent: "#7aa2f7",
    insert: "#9ece6a",
    visual: "#bb9af7",
    error: "#f7768e",
    warning: "#e0af68",
    gitAdd: "#9ece6a",
    gitMod: "#7aa2f7",
    gitDel: "#f7768e",
    statusNormal: "#7aa2f7",
    statusInsert: "#9ece6a",
    statusVisual: "#bb9af7",
    statusReplace: "#f7768e",
    statusTerminal: "#e0af68",
    statusRead: "#73daca",
    statusView: "#9aa5ce",
    statusError: "#f7768e",
    statusWarning: "#e0af68",
  },
  syntax: {
    fg: "#c0caf5",
    comment: "#636da6",
    keyword: "#bb9af7",
    fn: "#7aa2f7",
    string: "#9ece6a",
    number: "#ff9e64",
    type: "#2ac3de",
    constant: "#ff9e64",
    operator: "#89ddff",
    punct: "#9aa5ce",
    special: "#e0af68",
    field: "#73daca",
    param: "#e0af68",
    error: "#f7768e",
    cursor: "#c0caf5",
    selection: "rgb(122 162 247 / 0.2)",
    lineHighlight: "rgb(192 202 245 / 0.05)",
  },
  terminal: {
    foreground: "#c0caf5",
    cursor: "#c0caf5",
    selectionBackground: "#7aa2f733",
    black: "#15161e",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    white: "#a9b1d6",
    brightBlack: "#414868",
    brightRed: "#f7768e",
    brightGreen: "#9ece6a",
    brightYellow: "#e0af68",
    brightBlue: "#7aa2f7",
    brightMagenta: "#bb9af7",
    brightCyan: "#7dcfff",
    brightWhite: "#c0caf5",
  },
};

const catppuccinMocha: Theme = {
  ui: {
    bg0: "#11111b",
    bgSidebar: "#181825",
    bgTabs: "#181825",
    tab: "transparent",
    tabActive: "#313244",
    bg1: "#1e1e2e",
    bg2: "#222235",
    bg3: "#45475a",
    hover: "#2a2b3c",
    overlay: "#181825",
    edge: "rgb(205 214 244 / 0.1)",
    edgeSplit: "rgb(205 214 244 / 0.1)",
    edgeOverlay: "rgb(205 214 244 / 0.14)",
    fg1: "#cdd6f4",
    fg2: "#bac2de",
    fg3: "#a6adc8",
    fg4: "#9aa0ba",
    accent: "#89b4fa",
    insert: "#a6e3a1",
    visual: "#cba6f7",
    error: "#f38ba8",
    warning: "#fab387",
    gitAdd: "#a6e3a1",
    gitMod: "#89b4fa",
    gitDel: "#f38ba8",
    statusNormal: "#89b4fa",
    statusInsert: "#a6e3a1",
    statusVisual: "#cba6f7",
    statusReplace: "#f38ba8",
    statusTerminal: "#f9e2af",
    statusRead: "#94e2d5",
    statusView: "#b4befe",
    statusError: "#f38ba8",
    statusWarning: "#fab387",
  },
  syntax: {
    fg: "#cdd6f4",
    comment: "#7f849c",
    keyword: "#cba6f7",
    fn: "#89b4fa",
    string: "#a6e3a1",
    number: "#fab387",
    type: "#f9e2af",
    constant: "#fab387",
    operator: "#89dceb",
    punct: "#9399b2",
    special: "#f5c2e7",
    field: "#b4befe",
    param: "#eba0ac",
    error: "#f38ba8",
    cursor: "#f5e0dc",
    selection: "rgb(147 153 178 / 0.25)",
    lineHighlight: "rgb(205 214 244 / 0.05)",
  },
  terminal: {
    foreground: "#cdd6f4",
    cursor: "#f5e0dc",
    selectionBackground: "#9399b240",
    black: "#45475a",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#94e2d5",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5",
    brightWhite: "#a6adc8",
  },
};

const gruvboxDark: Theme = {
  ui: {
    bg0: "#1d2021",
    bgSidebar: "#1d2021",
    bgTabs: "#1d2021",
    tab: "transparent",
    tabActive: "#3c3836",
    bg1: "#282828",
    bg2: "#2e2c2a",
    bg3: "#504945",
    hover: "#32302f",
    overlay: "#32302f",
    edge: "rgb(235 219 178 / 0.1)",
    edgeSplit: "rgb(235 219 178 / 0.1)",
    edgeOverlay: "rgb(235 219 178 / 0.14)",
    fg1: "#ebdbb2",
    fg2: "#d5c4a1",
    fg3: "#bdae93",
    fg4: "#b0a086",
    accent: "#83a598",
    insert: "#b8bb26",
    visual: "#d3869b",
    error: "#fb4934",
    warning: "#fe8019",
    gitAdd: "#b8bb26",
    gitMod: "#83a598",
    gitDel: "#fb4934",
    statusNormal: "#83a598",
    statusInsert: "#b8bb26",
    statusVisual: "#d3869b",
    statusReplace: "#fb4934",
    statusTerminal: "#fabd2f",
    statusRead: "#8ec07c",
    statusView: "#a89984",
    statusError: "#fb4934",
    statusWarning: "#fe8019",
  },
  syntax: {
    fg: "#ebdbb2",
    comment: "#928374",
    keyword: "#fb4934",
    fn: "#b8bb26",
    string: "#8ec07c",
    number: "#d3869b",
    type: "#fabd2f",
    constant: "#d3869b",
    operator: "#fe8019",
    punct: "#a89984",
    special: "#fe8019",
    field: "#83a598",
    param: "#d5c4a1",
    error: "#fb4934",
    cursor: "#ebdbb2",
    selection: "rgb(235 219 178 / 0.18)",
    lineHighlight: "rgb(235 219 178 / 0.05)",
  },
  terminal: {
    foreground: "#ebdbb2",
    cursor: "#ebdbb2",
    selectionBackground: "#ebdbb22e",
    black: "#282828",
    red: "#cc241d",
    green: "#98971a",
    yellow: "#d79921",
    blue: "#458588",
    magenta: "#b16286",
    cyan: "#689d6a",
    white: "#a89984",
    brightBlack: "#928374",
    brightRed: "#fb4934",
    brightGreen: "#b8bb26",
    brightYellow: "#fabd2f",
    brightBlue: "#83a598",
    brightMagenta: "#d3869b",
    brightCyan: "#8ec07c",
    brightWhite: "#ebdbb2",
  },
};

export const DEFAULT_THEME = "graphite";
export const BUILTIN_THEMES: Record<string, Theme> = {
  graphite,
  kanagawa,
  "tokyo-night": tokyoNight,
  "catppuccin-mocha": catppuccinMocha,
  "gruvbox-dark": gruvboxDark,
};

const COLOR = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|hsl)a?\([^()]*\)|transparent)$/i;

// Checks the "themes" object of settings.json; throws with a message for the status line.
export function parseThemeSpecs(raw: unknown): Record<string, ThemeSpec> {
  const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (!isObject(raw)) throw new Error('settings.json: "themes" must be an object of name → theme');
  const parts: Record<string, readonly string[]> = {
    ui: Object.keys(UI_VARS),
    syntax: SYNTAX_KEYS,
    terminal: TERMINAL_KEYS,
  };
  const out: Record<string, ThemeSpec> = {};
  for (const [name, spec] of Object.entries(raw)) {
    const where = `settings.json themes.${name}`;
    if (!isObject(spec)) throw new Error(`${where} must be an object`);
    for (const [part, value] of Object.entries(spec)) {
      if (part === "extends") {
        if (typeof value !== "string") throw new Error(`${where}.extends must be a theme name`);
        continue;
      }
      const keys = parts[part];
      if (!keys) throw new Error(`${where}: unknown part "${part}", one of extends, ui, syntax, terminal`);
      if (!isObject(value)) throw new Error(`${where}.${part} must be an object of colors`);
      for (const [k, c] of Object.entries(value)) {
        if (!keys.includes(k)) throw new Error(`${where}.${part}: unknown color "${k}", one of ${keys.join(", ")}`);
        if (typeof c !== "string" || !COLOR.test(c)) {
          throw new Error(`${where}.${part}.${k} must be a color like "#7e9cd8" or "rgb(255 255 255 / 0.1)"`);
        }
      }
    }
    out[name] = spec as ThemeSpec;
  }
  return out;
}

export const themeNames = (specs: Record<string, ThemeSpec> = {}) => [
  ...new Set([...Object.keys(BUILTIN_THEMES), ...Object.keys(specs)]),
];

// A theme by name: the ones in settings.json first (a built-in's name there replaces it), then the built-in ones.
// "extends" follows the chain; a theme named like a built-in one, without "extends", changes that built-in theme.
export function resolveTheme(name: string, specs: Record<string, ThemeSpec> = {}, seen: string[] = []): Theme {
  if (seen.includes(name)) throw new Error(`settings.json: themes extend each other in a circle: ${[...seen, name].join(" → ")}`);
  const spec = specs[name];
  if (!spec) {
    const t = BUILTIN_THEMES[name];
    if (!t) throw new Error(`settings.json: unknown theme "${name}", one of ${themeNames(specs).join(", ")}`);
    return t;
  }
  const base = spec.extends ?? (BUILTIN_THEMES[name] ? name : DEFAULT_THEME);
  const parent = base === name ? resolveTheme(base, {}, seen) : resolveTheme(base, specs, [...seen, name]);
  return {
    ui: { ...parent.ui, ...spec.ui },
    syntax: { ...parent.syntax, ...spec.syntax },
    terminal: { ...parent.terminal, ...spec.terminal },
  };
}

let terminal: ITheme = BUILTIN_THEMES[DEFAULT_THEME].terminal;

// The xterm theme of the applied theme.
export const terminalTheme = (): ITheme => terminal;

// Puts a theme on the page: chrome and syntax colors as variables on :root, the terminal's colors for new and open
// terminals (they ask terminalTheme again). With glass on, the stylesheet keeps the translucent surfaces.
export function applyTheme(theme: Theme, glass = false, root = document.documentElement.style) {
  for (const [k, v] of Object.entries(UI_VARS) as [keyof UiColors, string][]) {
    if (glass && GLASS_SURFACES.includes(k)) root.removeProperty(v);
    else root.setProperty(v, theme.ui[k]);
  }
  for (const k of SYNTAX_KEYS) root.setProperty(synVar(k), theme.syntax[k]);
  terminal = { ...theme.terminal, background: theme.terminal.background ?? theme.ui.bg1 };
}
