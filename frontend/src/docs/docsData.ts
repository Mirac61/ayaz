import type { LucideIcon } from "lucide-react";
import { DOCS } from "../core/buffers";
import { Compass, Key, Code, FileText, Terminal, GitBranch, Bug, Cpu, Layers, CheckCircle, Map, Sliders } from "lucide-react";

export interface DocItem {
  id: string;
  title: string;
  category: "Getting Started" | "Editor & Navigation" | "Development & Tools" | "Architecture & Specs";
  icon: LucideIcon;
  content: string;
}

// Vite raw glob import of existing markdown files in docs/ and README.md
const rawDocs = import.meta.glob<string>("../../../docs/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const rawReadme = import.meta.glob<string>("../../../README.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const COMMANDS_DOC = `# Ayaz Keymap & Commands Reference

Ayaz is a keyboard-first code editor. Every action is a registered command and can be bound to key combinations.

## Essential Shortcuts

| Shortcut | Command | Description |
|---|---|---|
| \`<Space>ff\` / \`Cmd+P\` | \`find.files\` | Fast fuzzy file picker across workspace |
| \`<Space>fw\` / \`Cmd+Shift+F\` | \`find.grep\` | Full-text grep search across project files |
| \`<Space>fo\` | \`find.recent\` | Recently opened files |
| \`<Space>fb\` | \`find.buffers\` | List open editor buffers |
| \`<Space>fp\` | \`folder.switch\` | Switch project: recent folders, or open another one |
| \`<Space>t\` / \`Cmd+J\` | \`term.panel\` | Toggle integrated terminal bottom panel |
| \`<Space>tf\` | \`term.float\` | Toggle floating scratchpad terminal |
| \`<Space>tt\` | \`term.tab\` | Open terminal in current pane tab |
| \`<Space>uz\` / \`:zen\` | \`view.zen\` | Toggle distraction-free Zen mode |
| \`<Space>ub\` | \`git.toggleInlineBlame\` | Toggle ghost line Git blame |
| \`<Space>uv\` (Vim mode) / \`Cmd+Shift+M\` | \`editor.toggleVim\` | Toggle modal Vim vs. modeless Standard editing |
| \`<F1>\` / \`:help\` / \`:docs\` | \`app.docs\` | Open this interactive Docs Hub |

---

## Splits & Window Management

| Shortcut | Command | Action |
|---|---|---|
| \`<C-w>s\` / \`:split\` | \`pane.splitDown\` | Split current pane horizontally |
| \`<C-w>v\` / \`:vsplit\` | \`pane.splitRight\` | Split current pane vertically |
| \`<C-w>c\` / \`:q\` | \`pane.close\` | Close active pane (or exit if last) |
| \`<C-w>=\` | \`pane.equal\` | Equalize split pane proportions |
| \`<C-w>+\` / \`<C-w>-\` | \`pane.taller\` / \`shorter\` | Adjust split heights |
| \`<C-w>>\` / \`<C-w><\` | \`pane.wider\` / \`narrower\` | Adjust split widths |
| \`<C-w>z\` | \`term.maximize\` | Maximize terminal panel |

---

## Git Remote Suite

| Command | Ex Alias | Action |
|---|---|---|
| \`<Space>gp\` | \`:Gpush\` / \`:Gp\` | Git push local commits to upstream remote |
| \`<Space>gl\` | \`:Gpull\` / \`:Gpul\` | Git pull latest commits from remote |
| \`<Space>gf\` | \`:Gfetch\` / \`:Gf\` | Git fetch remote references |
| \`<Space>grb\` | \`:Grebase\` / \`:Greb\` | Git rebase current branch on upstream |
| \`<Space>ga\` | \`:Gwrite\` / \`:Gw\` | Stage current active file |
| \`<Space>gu\` | \`git.unstageFile\` | Unstage current active file |
| \`<Space>gA\` | \`git.stageAll\` | Stage all changes in workspace |
| \`<Space>gU\` | \`git.unstageAll\` | Unstage all changes in workspace |
| \`<Space>gc\` | \`:Gcommit\` / \`:Gc\` | Commit staged changes |
| \`<Space>gD\` | \`:Gvdiffsplit\` | Split diff view against HEAD |
| \`<Space>gg\` | \`term.lazygit\` | Open Lazygit terminal interface |
`;

const VIM_DOC = `# Neovim Motions & Text Objects in Ayaz

Ayaz embeds \`@replit/codemirror-vim\` with its own extensions (structural text objects, surround, more \`:\` commands) for daily Neovim muscle memory. It is an emulation, not Neovim: there is no Vimscript, no Lua config, no plugins, and it is not 100 % compatible with Vim.

## Core Motions & Operators

- Standard normal motions: \`h\`, \`j\`, \`k\`, \`l\`, \`w\`, \`b\`, \`e\`, \`0\`, \`$\`, \`gg\`, \`G\`.
- Screen line motions: \`gj\`, \`gk\` navigate wrapped rows smoothly.
- Operators: \`d\` (delete), \`c\` (change), \`y\` (yank), \`p\` (paste), \`>\` / \`<\` (indent), \`gcc\` (comment line), \`gc{motion}\`.

## Surround Commands
Like \`nvim-surround\`:
- \`ys{motion}{char}\`: Surround motion with delimiter (e.g. \`ysiw"\` surrounds word with quotes).
- \`ds{char}\`: Delete surrounding delimiter (e.g. \`ds(\` removes parentheses).
- \`cs{old}{new}\`: Change surrounding delimiter (e.g. \`cs"'\` changes double to single quotes).

## Structural Text Objects
- \`af\` / \`if\`: Outer/inner function or method.
- \`ac\` / \`ic\`: Outer/inner class, struct, interface or type.
- \`aa\` / \`ia\`: Outer/inner parameter or argument.
- \`]\` / \`[\` jumps: \`]f\` / \`[f\` jump to next/previous function start; \`]d\` / \`[d\` jump between LSP diagnostics; \`]c\` / \`[c\` jump between git change hunks.

## Modal Vim vs. Modeless Standard Mode
Ayaz supports both modal Vim editing and modeless standard editing:
- **Toggle Mode (\`Cmd+Shift+M\`, Ctrl+Shift+M on Linux/Windows):** Instantly switch between Vim mode and Standard mode. \`<Space>uv\` does the same, but only from Vim's normal mode, since Standard mode types the space.
- **Configurable in \`settings.json\`:**
  - \`"vim": true\` — Enables modal Vim editing with relative line numbers.
  - \`"vim": false\` — Modeless standard editing (direct typing, caret navigation, absolute line numbers).
`;

const SETTINGS_DOC = `# Ayaz Configuration & settings.json Reference

Ayaz is configured through a single JSON/JSONC file located at \`~/.config/ayaz/settings.json\`. Saving the file applies changes immediately without restart.

## Core Options

| Setting | Type | Default | Description |
|---|---|---|---|
| \`vim\` | \`boolean\` | \`true\` | Enable modal Vim editing. Set to \`false\` for modeless standard editing. |
| \`theme\` | \`string\` | \`"graphite"\` | Color theme (\`"graphite"\`, \`"kanagawa"\`, \`"tokyo-night"\`, \`"catppuccin-mocha"\`, \`"gruvbox-dark"\`). |
| \`statusline\` | \`"top" \| "bottom"\` | \`"top"\` | Status line position (in title bar or bottom row). |
| \`sidebar\` | \`"left" \| "right"\` | \`"left"\` | Position of the file tree sidebar. |
| \`fontSize\` | \`number\` | \`13\` | Editor and terminal font size in px (6–48). |
| \`ligatures\` | \`boolean\` | \`true\` | Font ligatures in the editor (\`!=\`, \`:=\`, \`>=\`). The terminal is not affected. |
| \`font\` | \`string\` | \`""\` | Monospace editor font family. Fallbacks include Nerd Font symbols. |
| \`tabWidth\` | \`number\` | \`4\` | Tab / indentation width in spaces (1–16). |
| \`tabs\` | \`boolean\` | \`false\` | Indent with tabs instead of spaces. |
| \`formatOnSave\` | \`boolean\` | \`false\` | Run language formatter automatically on file save. |
| \`stickyScroll\` | \`boolean\` | \`true\` | Stick enclosing function / class headers to editor top. |
| \`inlayHints\` | \`boolean\` | \`false\` | Display inline parameter names and type hints from LSP. |
| \`semanticTokens\`| \`boolean\` | \`true\` | Semantic syntax highlighting from language servers. |
| \`glass\` | \`boolean\` | \`false\` | Enable translucent frosted glass surfaces and blur. |
| \`glassOpacity\` | \`number\` | \`1.0\` | Glass surface opacity (0.3 to 1.0). |

---

## Statusline Colors (\`statusColors\`)

Override individual mode and status line colors with hex strings:

\`\`\`jsonc
"statusColors": {
  "normal": "#7e9cd8",    // Normal mode (Sapphire Blue)
  "insert": "#98bb6c",    // Insert mode & Clean Git branch icon (Jade Green)
  "visual": "#957fb8",    // Visual mode (Amethyst Purple)
  "replace": "#e46876",   // Replace mode (Coral Red)
  "standard": "#7aa2f7",  // Standard non-Vim mode (Sky Cyan)
  "terminal": "#c0a36e",  // Terminal pane mode (Warm Ochre)
  "read": "#7aa89f",      // Read-only / Markdown preview mode (Sage Teal)
  "view": "#9cabca",      // Custom viewer mode (Slate Blue)
  "warning": "#dca561",   // Warning counts & Dirty Git branch icon (Warm Amber / Orange)
  "error": "#e46876"      // Error counts & error messages (Coral Red)
}
\`\`\`

---

## Language-Specific Overrides (\`languages\`)

Customize behavior per language:

\`\`\`jsonc
"languages": {
  "go": { "tabs": true, "formatOnSave": true },
  "md": { "wrap": true },
  "typ": { "wrap": true, "formatOnSave": true },
  "tex": { "wrap": true }
}
\`\`\`
`;

const LSP_DEBUG_DOC = `# LSP & DAP Debugger

Ayaz provides complete Language Server Protocol (LSP) and Debug Adapter Protocol (DAP) integration.

## Language Server (LSP) Features
- **Hover (\`K\`):** Displays type signature and documentation tooltip.
- **Go to Definition (\`gd\`):** Jumps to symbol definition across workspace files and standard library.
- **References (\`gr\`):** Populates quickfix list with all symbol references across the project.
- **Rename (\`<Space>cr\`):** Project-wide symbol rename with live preview.
- **Code Actions (\`<Space>ca\`):** Contextual code fixes and imports.
- **Format on Save:** Automatically formats Go and configured languages on save.

## Interactive Debugger (DAP)
- **Toggle Breakpoint (\`<Space>db\`):** Sets/clears breakpoint on current line or via gutter click.
- **Conditional / Logpoints (\`<Space>dB\`):** Sets conditional expressions or log message points.
- **Start / Continue (\`<Space>dc\`):** Starts debug session or continues paused execution.
- **Step Over (\`<Space>dn\`), Step Into (\`<Space>ds\`), Step Out (\`<Space>do\`):** Standard stepping controls.
- **Callstack (\`<Space>dk\`):** Inspects callstack frames and switches evaluation scope.
- **Watch Expressions (\`<Space>dw\`):** Evaluates variables dynamically at breakpoints.
`;

const readmeContent = rawReadme["../../../README.md"] || "";
const visionContent = rawDocs["../../../docs/00-vision.md"] || "";
const archContent = rawDocs["../../../docs/02-architecture.md"] || "";
const perfContent = rawDocs["../../../docs/03-performance.md"] || "";
const testContent = rawDocs["../../../docs/04-testing.md"] || "";
const roadmapContent = rawDocs["../../../docs/05-roadmap.md"] || "";

const ITEMS: DocItem[] = [
  // 1. Getting Started
  {
    id: "getting-started",
    category: "Getting Started",
    icon: Compass,
    title: "Getting Started & Overview",
    content: readmeContent || visionContent,
  },
  {
    id: "keymap-commands",
    category: "Getting Started",
    icon: Key,
    title: "Keymap & Command Cheatsheet",
    content: COMMANDS_DOC,
  },
  {
    id: "configuration-settings",
    category: "Getting Started",
    icon: Sliders,
    title: "Settings & Configuration (settings.json)",
    content: SETTINGS_DOC,
  },

  // 2. Editor & Navigation
  {
    id: "neovim-vim",
    category: "Editor & Navigation",
    icon: Code,
    title: "Vim Navigation & Motions",
    content: VIM_DOC,
  },
  {
    id: "markdown-viewers",
    category: "Editor & Navigation",
    icon: FileText,
    title: "Markdown, Reading Mode & Previews",
    content: `# Native Markdown, PDFs and Real Terminals

Ayaz renders rich documents natively alongside code without heavy Electron overhead.

## Markdown Reading View & Split Preview
- **Reading View (\`<Space>mr\`):** Hides raw markdown formatting tokens for clean reading while maintaining Neovim motions.
- **Toggle Split Preview (\`<Space>mp\`):** Opens a live rendered preview of the active Markdown document in an adjacent pane.
- **Skins (\`<Space>ms\`):** Picks the look of the reading view: \`github\`, \`kairo\`, \`document\` (serif, for long reads), \`compact\` (dense, for notes and tables) or \`wide\` (full width). The cursor previews a skin, the pick is kept across restarts until \`"markdownSkin"\` in \`settings.json\` changes.
- **Outline (\`<Space>mh\`):** Lists the document's headings and jumps to one, in the editor and in the reading view. It opens on the heading you are under.
- **Smart Reading Mode:** Automatically opens older or existing documents in reading view, while newly created or edited files stay in edit mode (configurable in \`settings.json\`).
- **Export & Build Support:** Directly compiles Typst, LaTeX and Markdown documents into live PDF views.
`,
  },
  {
    id: "terminals",
    category: "Editor & Navigation",
    icon: Terminal,
    title: "Built-in PTY Terminal & Lazygit",
    content: `# Built-In PTY Terminal & Lazygit

Ayaz provides a full xterm.js terminal connected directly to your system shell.

## Terminal Features
- **Bottom Panel (\`<Space>t\` / \`Cmd+J\`):** Full interactive terminal panel at the bottom of the window.
- **Floating Scratchpad (\`<Space>tf\`):** Fast pop-over terminal for quick commands.
- **Terminal as Split Pane (\`<Space>tt\`):** Opens a terminal buffer in any editor pane.
- **Send Line/Selection (\`<Space>ts\` / \`<C-CR>\`):** Sends current line or visual selection directly into the terminal.
- **Lazygit (\`<Space>gg\`):** Launches lazygit directly in an editor tab.
`,
  },

  // 3. Development & Tools
  {
    id: "git-suite",
    category: "Development & Tools",
    icon: GitBranch,
    title: "Git Suite & Remote Operations",
    content: `# Git Remote Suite in Ayaz

Ayaz features a complete, zero-terminal Git suite directly built into the editor and sidebar.

## Key Capabilities

1. **Remote Operations Toolbar:**
   - **Push (\`⇡ Push\` / \`<Space>gp\` / \`:Gpush\`):** Push local commits directly to the remote tracking branch.
   - **Pull (\`⇣ Pull\` / \`<Space>gl\` / \`:Gpull\`):** Pull remote changes with live progress state.
   - **Fetch (\`⟳ Fetch\` / \`<Space>gf\` / \`:Gfetch\`):** Fetch upstream refs without modifying the working tree.
   - **Rebase (\`<Space>grb\` / \`:Grebase\`):** Rebase the current branch smoothly onto upstream.

2. **Sidebar File Operations:**
   - **Staged Changes vs. Changes:** Separate sections with single-click \`+\` (Stage), \`-\` (Unstage), and \`↺\` (Discard).
   - **Direct Commit Box:** Enter commit messages directly in the sidebar with \`Ctrl+Enter\`.
   - **Diff Splitting:** Press \`D\` on any changed item to inspect a side-by-side diff against HEAD.
   - **Inline Blame:** Toggle ghost blame info with \`<Space>ub\` or view blame on current line with \`<Space>gb\`.
`,
  },
  {
    id: "lsp-debugging",
    category: "Development & Tools",
    icon: Bug,
    title: "LSP & DAP Debugger",
    content: LSP_DEBUG_DOC,
  },

  // 4. Architecture & Specs
  {
    id: "architecture",
    category: "Architecture & Specs",
    icon: Cpu,
    title: "Architecture & Low Memory Design",
    content: archContent || visionContent,
  },
  {
    id: "performance",
    category: "Architecture & Specs",
    icon: Layers,
    title: "Performance Budgets & RAM",
    content: perfContent,
  },
  {
    id: "testing",
    category: "Architecture & Specs",
    icon: CheckCircle,
    title: "Testing Strategy & Quality",
    content: testContent,
  },
  {
    id: "roadmap",
    category: "Architecture & Specs",
    icon: Map,
    title: "Milestones & Roadmap",
    content: roadmapContent,
  },
];

// Images and badges point at files beside the repo's Markdown that the app doesn't ship: they would show broken.
const noImages = (md: string) => md.replace(/^\[?!\[[^\]]*\]\([^)]*\)(\]\([^)]*\))?[ \t]*\n/gm, "");

export const DOC_ITEMS: DocItem[] = ITEMS.map((d) => ({ ...d, content: noImages(d.content) }));

export { DOCS };
export const DOCS_INDEX = `${DOCS}index.md`;
export const docPath = (id: string) => `${DOCS}${id}.md`;

const INDEX = `# Ayaz Docs

\`<F1>\` or \`:help\` opens the documentation hub.
Use the sidebar or search bar to browse through all topics:

${DOC_ITEMS.map((d) => `- [${d.title}](${d.id}.md) *(${d.category})*`).join("\n")}
`;

// The text of a docs:// path; an unknown topic says so instead of failing.
export function docText(path: string): string {
  const id = path.slice(DOCS.length).replace(/\.md$/, "");
  if (id === "index") {
    return INDEX;
  }
  return (
    DOC_ITEMS.find((d) => d.id === id)?.content ?? `# Not found\n\nThere is no docs topic "${id}". See [the index](index.md).\n`
  );
}

// Predicate to match doc items against a search query across title, category, and content.
export function matchDoc(doc: DocItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return doc.title.toLowerCase().includes(q) || doc.category.toLowerCase().includes(q) || doc.content.toLowerCase().includes(q);
}

// Looks up a topic in the given list of doc items: exact id, then partial id, then title.
export function findDocIn(items: DocItem[], topic: string): DocItem | undefined {
  const q = topic.trim().toLowerCase();
  return (
    items.find((d) => d.id === q) ?? items.find((d) => d.id.includes(q)) ?? items.find((d) => d.title.toLowerCase().includes(q))
  );
}

// :help <topic>: an exact id, then the first id containing words, then title.
export function findDoc(topic: string): DocItem | undefined {
  return findDocIn(DOC_ITEMS, topic);
}

// What the start page's docs folder holds: one file per topic plus the index.
export const docFiles = (): Record<string, string> =>
  Object.fromEntries([["index.md", INDEX], ...DOC_ITEMS.map((d) => [`${d.id}.md`, d.content])]);
