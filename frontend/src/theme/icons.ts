// Nerd Font glyphs and colors as nvim-web-devicons has them, so the tree looks like the nvim one.
// Needs a Nerd Font installed (see --font-mono); without one the glyphs show as boxes.
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
export const folderIcon = (open: boolean): Icon => [open ? "\ue5fe" : "\ue5ff", "#7e9cd8"];

export function fileIcon(name: string): Icon {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return byName[lower] ?? (dot >= 0 ? byExt[lower.slice(dot + 1)] : undefined) ?? file;
}
