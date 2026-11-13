export interface DocItem {
  id: string;
  title: string;
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
| \`<Space>fg\` / \`Cmd+Shift+F\` | \`find.grep\` | Full-text grep search across project files |
| \`<Space>fo\` | \`find.recent\` | Recently opened files |
| \`<Space>fb\` | \`find.buffers\` | List open editor buffers |
| \`<Space>t\` / \`Cmd+J\` | \`term.panel\` | Toggle integrated terminal bottom panel |
| \`<Space>tf\` | \`term.float\` | Toggle floating scratchpad terminal |
| \`<Space>tt\` | \`term.tab\` | Open terminal in current pane tab |
| \`<Space>uz\` / \`:zen\` | \`view.zen\` | Toggle distraction-free Zen mode |
| \`<Space>ub\` | \`git.toggleInlineBlame\` | Toggle ghost line Git blame |
| \`<F1>\` / \`:help\` / \`:docs\` | \`app.docs\` | Open these docs |

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

---

## Neovim Motions & Text Objects
- Standard normal mode motions (\`h\`, \`j\`, \`k\`, \`l\`, \`w\`, \`b\`, \`e\`, \`0\`, \`$\`, \`gg\`, \`G\`).
- Surround commands (\`ys\`, \`cs\`, \`ds\`).
- Structural text objects (\`daf\` delete function, \`cia\` change inside argument).
- Multi-cursor next occurrence: \`gb\` in normal or visual mode.
- LSP motions: \`gd\` go to definition, \`K\` hover type info, \`gr\` references.
`;

const readmeContent = rawReadme["../../../README.md"] || "";
const visionContent = rawDocs["../../../docs/00-vision.md"] || "";
const archContent = rawDocs["../../../docs/02-architecture.md"] || "";
const perfContent = rawDocs["../../../docs/03-performance.md"] || "";
const testContent = rawDocs["../../../docs/04-testing.md"] || "";
const roadmapContent = rawDocs["../../../docs/05-roadmap.md"] || "";

const ITEMS: DocItem[] = [
  {
    id: "getting-started",
    title: "Getting Started & Overview",
    content: readmeContent || visionContent,
  },
  {
    id: "keymap-commands",
    title: "Keymap & Command Cheatsheet",
    content: COMMANDS_DOC,
  },
  {
    id: "git-suite",
    title: "Git Remote Suite & Sidebar",
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
    id: "markdown-viewers",
    title: "Markdown, PDFs & Terminals",
    content: `# Native Markdown, PDFs and Real Terminals

Ayaz renders rich documents natively alongside code without heavy Electron overhead.

## Markdown Reading View & Split Preview
- **Toggle Split Preview (\`<Space>mp\`):** Opens a live rendered preview of the active Markdown document in an adjacent pane.
- **Reading View (\`<Space>mr\`):** Hides raw markdown formatting tokens for clean reading while maintaining Neovim motions.
- **Export & Build Support:** Directly compiles Typst, LaTeX and Markdown documents into live PDF views.

## Built-In PTY Terminal
- **Bottom Panel (\`<Space>t\` / \`Cmd+J\`):** Full interactive xterm.js terminal connected directly to your system shell.
- **Floating Scratchpad (\`<Space>tf\`):** Fast pop-over terminal for quick commands.
- **Send Line/Selection (\`<Space>ts\` / \`<C-CR>\`):** Sends current line or visual selection directly into the terminal.
- **Lazygit (\`<Space>gg\`):** Launches lazygit directly in an editor tab.
`,
  },
  {
    id: "architecture",
    title: "Architecture & Low Memory Design",
    content: archContent || visionContent,
  },
  {
    id: "performance",
    title: "Performance Budgets & RAM",
    content: perfContent,
  },
  {
    id: "testing",
    title: "Testing Strategy & Quality",
    content: testContent,
  },
  {
    id: "roadmap",
    title: "Milestones & Roadmap",
    content: roadmapContent,
  },
];

// Images and badges point at files beside the repo's Markdown that the app doesn't ship: they would show broken.
const noImages = (md: string) => md.replace(/^\[?!\[[^\]]*\]\([^)]*\)(\]\([^)]*\))?[ \t]*\n/gm, "");

export const DOC_ITEMS: DocItem[] = ITEMS.map((d) => ({ ...d, content: noImages(d.content) }));

// Docs open as read-only Markdown buffers (shell/editors), like Vim's :help.
export const DOCS = "docs://";
export const DOCS_INDEX = `${DOCS}index.md`;
export const docPath = (id: string) => `${DOCS}${id}.md`;

const INDEX = `# Ayaz docs

\`<F1>\` or \`:help\` opens this page, \`:help <topic>\` a topic (\`:help git\`).
The command palette lists the topics under "Docs: find topic".

${DOC_ITEMS.map((d) => `- [${d.title}](${d.id}.md)`).join("\n")}
`;

// The text of a docs:// path; an unknown topic says so instead of failing.
export function docText(path: string): string {
  const id = path.slice(DOCS.length).replace(/\.md$/, "");
  if (id === "index") return INDEX;
  return DOC_ITEMS.find((d) => d.id === id)?.content ?? `# Not found\n\nThere is no docs topic "${id}". See [the index](index.md).\n`;
}

// :help <topic>: an exact id, then the first id or title containing the words.
export function findDoc(topic: string): DocItem | undefined {
  const q = topic.trim().toLowerCase();
  return DOC_ITEMS.find((d) => d.id === q) ?? DOC_ITEMS.find((d) => d.id.includes(q) || d.title.toLowerCase().includes(q));
}

// What the start page's docs folder holds: one file per topic plus the index.
export const docFiles = (): Record<string, string> =>
  Object.fromEntries([["index.md", INDEX], ...DOC_ITEMS.map((d) => [`${d.id}.md`, d.content])]);
