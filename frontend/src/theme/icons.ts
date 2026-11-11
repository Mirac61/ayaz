// Nerd Font glyphs and colors as nvim-web-devicons has them, so the tree looks like the nvim one.
// The glyphs come from an installed Nerd Font, else from the bundled symbols font (theme/tokens.css).
type Icon = [glyph: string, color: string];

const byExt: Record<string, Icon> = {
  go: ["\ue65e", "#519aba"],
  c: ["\ue61e", "#599eff"], h: ["\uf0fd", "#a074c4"], cc: ["\ue61d", "#f34b7d"], cpp: ["\ue61d", "#519aba"], hpp: ["\uf0fd", "#a074c4"],
  js: ["\ue74e", "#cbcb41"], mjs: ["\ue74e", "#f1e05a"], jsx: ["\ue7ba", "#20c2e3"],
  ts: ["\ue628", "#519aba"], tsx: ["\ue7ba", "#1354bf"],
  html: ["\ue736", "#e44d26"], css: ["\ue749", "#42a5f5"], json: ["\ue60b", "#cbcb41"],
  java: ["\ue738", "#cc3e44"], md: ["\uf48a", "#dddddd"],
  lua: ["\ue620", "#51a0cf"], py: ["\ue606", "#ffbc03"], rs: ["\ue7a8", "#dea584"],
  sh: ["\ue795", "#89e051"], zsh: ["\ue795", "#89e051"],
  yml: ["\ue6a8", "#6d8086"], yaml: ["\ue6a8", "#6d8086"], toml: ["\ue6b2", "#9c4221"],
  lock: ["\uf023", "#bbbbbb"], mod: ["\ue65e", "#519aba"], sum: ["\ue65e", "#cbcb41"],
  svg: ["\uf1c5", "#ffb13b"], png: ["\uf1c5", "#a074c4"], jpg: ["\uf1c5", "#a074c4"], gif: ["\uf1c5", "#a074c4"],
  pdf: ["\uf1c1", "#b30b00"], txt: ["\uf0f6", "#89e051"],
};

const byName: Record<string, Icon> = {
  ".gitignore": ["\ue702", "#f54d27"], ".gitattributes": ["\ue702", "#f54d27"],
  makefile: ["\ue779", "#6d8086"], dockerfile: ["\uf308", "#458ee6"], license: ["\ue60a", "#d0bf41"],
  "taskfile.yml": ["\ue6a8", "#6d8086"],
};

const file: Icon = ["\uf15b", "#6d8086"];
// Well-known folder names get their own glyph in the neutral folder gray (only .git keeps a hue), so the tree stays calm.
// A named folder keeps its glyph open and closed; the chevron shows the state.
const folderByName: Record<string, Icon> = {
  src: ["\uf121", "#85858b"], app: ["\uf2d0", "#85858b"], internal: ["\uf023", "#85858b"], cmd: ["\uf120", "#85858b"],
  pkg: ["\uf187", "#85858b"], lib: ["\uf02d", "#85858b"],
  frontend: ["\uf108", "#85858b"], components: ["\uf12e", "#85858b"], public: ["\uf0ac", "#85858b"],
  docs: ["\uf02d", "#85858b"], doc: ["\uf02d", "#85858b"],
  test: ["\uf0c3", "#85858b"], tests: ["\uf0c3", "#85858b"], testdata: ["\uf1c0", "#85858b"], e2e: ["\uf0c3", "#85858b"],
  scripts: ["\uf120", "#85858b"], build: ["\uf0ad", "#85858b"], bin: ["\uf013", "#85858b"],
  ".github": ["\uf09b", "#85858b"], ".git": ["\ue702", "#e46876"],
};
export const folderIcon = (open: boolean, name = ""): Icon =>
  folderByName[name] ?? [open ? "\ue5fe" : "\ue5ff", "#85858b"];

export function fileIcon(name: string): Icon {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return byName[lower] ?? (dot >= 0 ? byExt[lower.slice(dot + 1)] : undefined) ?? file;
}

// LSP SymbolKind (1–26) → codicon glyph from the Nerd Font, colored like the Kanagawa groups for the same things.
const SYM: Record<number, Icon> = {
  1: ["\ueb60", "#dcd7ba"], 2: ["\uea8b", "#e6c384"], 3: ["\uea8b", "#e6c384"], 4: ["\uea8b", "#e6c384"],
  5: ["\ueb5b", "#7aa89f"], 6: ["\uea8c", "#7e9cd8"], 7: ["\ueb65", "#e6c384"], 8: ["\ueb5f", "#e6c384"],
  9: ["\uea8c", "#7e9cd8"], 10: ["\uea95", "#7aa89f"], 11: ["\ueb61", "#7aa89f"], 12: ["\uea8c", "#7e9cd8"],
  13: ["\uea88", "#dcd7ba"], 14: ["\ueb5d", "#ffa066"], 15: ["\ueb8d", "#98bb6c"], 16: ["\uea90", "#d27e99"],
  17: ["\uea8f", "#ffa066"], 18: ["\uea8a", "#dcd7ba"], 19: ["\uea8b", "#dcd7ba"], 20: ["\uea93", "#e6c384"],
  21: ["\ueb63", "#727169"], 22: ["\ueb5e", "#ffa066"], 23: ["\uea91", "#7aa89f"], 24: ["\uea86", "#e6c384"],
  25: ["\ueb64", "#c0a36e"], 26: ["\uea92", "#7aa89f"],
};
export const symbolIcon = (kind: number): Icon => SYM[kind] ?? ["\ueb63", "#727169"];

// Command palette and Spotlight icons (Nerd Font glyphs, Kanagawa palette colors).
const CMD: Record<string, Icon> = {
  "file.save": ["\uf0c7", "#98bb6c"],
  "file.saveClose": ["\uf0c7", "#98bb6c"],
  "file.open": ["\uf15b", "#7fb4ca"],
  "file.new": ["\uf15b", "#98bb6c"],
  "file.rename": ["\uf044", "#e6c384"],
  "file.trash": ["\uf1f8", "#e46876"],
  "pane.splitRight": ["\ueb56", "#7e9cd8"],
  "pane.splitDown": ["\ueb56", "#7e9cd8"],
  "pane.close": ["\uf00d", "#e46876"],
  "app.quit": ["\uf00d", "#e46876"],
  "settings.open": ["\uf013", "#e6c384"],
  "find.commands": ["\uf11c", "#957fb8"],
};

export function commandIcon(id: string): Icon {
  if (CMD[id]) return CMD[id];
  if (id.startsWith("find.")) return ["\uf002", "#7fb4ca"];
  if (id.startsWith("pane.") || id.startsWith("view.") || id.startsWith("tab.")) return ["\ueb56", "#7e9cd8"];
  if (id.startsWith("term.") || id.startsWith("task.")) return ["\ue795", "#c0a36e"];
  if (id.startsWith("git.") || id.startsWith("merge.")) return ["\ue725", "#dca561"];
  if (id.startsWith("debug.")) return ["\uf188", "#e82424"];
  if (id.startsWith("lsp.")) return ["\uea8c", "#7aa89f"];
  return ["\ueb60", "#9cabca"];
}
