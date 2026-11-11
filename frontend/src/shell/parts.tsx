import { useEffect, useRef } from "react";
import { parseKeys, type Binding } from "../core/keymap";

// Names for the leader groups, so "<Space>f" reads "+find" instead of "+11 keymaps". Other prefixes keep the count.
const GROUPS: Record<string, string> = {
  "<Space>b": "buffer", "<Space>c": "code", "<Space>d": "debug", "<Space>f": "find", "<Space>g": "git",
  "<Space>h": "hunks", "<Space>m": "markdown, merge", "<Space>r": "run tasks", "<Space>u": "view", "<Space>t": "terminal",
};

// Nerd Font glyphs per leader group and per command, so a row can be found by its icon. A command without one takes its group's.
const GROUP_ICONS: Record<string, string> = {
  "<Space>b": "\uf0c5", "<Space>c": "\uf121", "<Space>d": "\uf188", "<Space>f": "\uf002", "<Space>g": "\ue702",
  "<Space>h": "\uf440", "<Space>m": "\uf48a", "<Space>r": "\uf04b", "<Space>u": "\uf06e", "<Space>t": "\uf120",
};
const COMMAND_ICONS: Record<string, string> = {
  "tree.focus": "\uf07b", "tree.revealCurrent": "\uf07c", "term.panel": "\uf120", "term.split": "\uf120", "term.lazygit": "\ue702",
  "term.send": "\uf120", "term.float": "\uf120",
  "find.files": "\uf15b", "find.grep": "\uf002", "find.commands": "\uf0e7", "find.recent": "\uf1da", "find.buffers": "\uf0c5",
  "folder.switch": "\uf07c", "theme.switch": "\uf1fc", "lsp.symbols": "\uf1b2", "lsp.workspaceSymbols": "\uf1b3",
  "lsp.diagnostics": "\uf071", "file.history": "\uf1da", "lsp.rename": "\uf040", "lsp.codeAction": "\uf0eb",
  "task.run": "\uf04b", "task.last": "\uf01e", "tab.close": "\uf00d", "harpoon.toggle": "\uf02e", "harpoon.menu": "\uf02e",
  "debug.toggleBreakpoint": "\uf111", "debug.start": "\uf04b", "debug.continue": "\uf051", "debug.stop": "\uf04d",
  "debug.next": "\uf050", "debug.stepIn": "\uf063", "debug.stepOut": "\uf062",
  "git.diff": "\uf440", "git.blame": "\uf007", "git.stageHunk": "\uf067", "git.unstageHunk": "\uf068", "git.resetHunk": "\uf0e2",
  "git.previewHunk": "\uf06e", "md.reading": "\uf06e", "md.preview": "\uf06e", "md.skin": "\uf1fc", "md.outline": "\uf0ca",
  "view.wrap": "\uf039", "view.diagnosticText": "\uf071", "view.zen": "\uf06e", "git.toggleInlineBlame": "\uf007",
};
const COLUMN_AT = 8; // more rows than this flow into two columns

// The which-key box: one row per next key, with an icon; a key that only leads further shows its group or how many bindings follow.
export function Hints({ keys, next, title }: { keys: string[]; next: Binding[]; title(id: string): string }) {
  const groups = new Map<string, Binding[]>();
  for (const b of next) {
    const k = parseKeys(b.keys)[keys.length];
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const prefix = keys.join("");
  const rows = [...groups].sort(([a], [b]) => a.localeCompare(b));
  const columns = rows.length > COLUMN_AT;
  return (
    <div className={columns ? "hints wide" : "hints"} role="status" aria-label="Next keys">
      <div className="hints-title label">
        {keys.map((k, i) => <span key={i} className="hints-key">{k}</span>)}
        {GROUPS[prefix] && <span className="group named">{GROUPS[prefix]}</span>}
      </div>
      <ul style={columns ? { gridTemplateRows: `repeat(${Math.ceil(rows.length / 2)}, auto)` } : undefined}>
        {rows.map(([k, bs]) => {
          const exact = bs.find((b) => parseKeys(b.keys).length === keys.length + 1);
          const more = bs.length - (exact ? 1 : 0);
          const group = GROUPS[prefix + k];
          const icon = (exact && COMMAND_ICONS[exact.command]) || GROUP_ICONS[prefix + k] || GROUP_ICONS[prefix] || "\uf105";
          return (
            <li key={k} className={exact ? "leaf" : "branch"}>
              <kbd>{k}</kbd>
              <span className="hints-icon" data-glyph={icon} aria-hidden="true" />
              <span className={exact ? "hints-label" : group ? "hints-label group named" : "hints-label group"}>
                {exact ? title(exact.command) : group ? `+${group}` : `+${more} keymap${more > 1 ? "s" : ""}`}
                {exact && more > 0 && <span className="group"> +{more}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// A split border or the panel's top edge; dragging it calls onDrag with each pointer move.
export function Handle({ dir, style, onDrag }: { dir: "row" | "col"; style: React.CSSProperties; onDrag(e: PointerEvent): void }) {
  return (
    <div
      className={`resize ${dir}`}
      style={style}
      onPointerDown={(e) => {
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        el.addEventListener("pointermove", onDrag);
        el.addEventListener("pointerup", () => el.removeEventListener("pointermove", onDrag), { once: true });
        e.preventDefault(); // no text selection while dragging
      }}
    />
  );
}

export interface PaneProps {
  id: number;
  active: boolean;
  style: React.CSSProperties;
  edge: { left: boolean; top: boolean };
  mount(el: HTMLDivElement): () => void;
  onClose?(): void; // a split pane can be closed with the mouse
}

// Panes are siblings positioned from the layout rects, so a split never remounts an existing editor.
export function Pane({ id, active, style, edge, mount, onClose }: PaneProps) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => mount(el.current!), []);
  const cls = ["pane", active && "active", edge.left && "edge-left", edge.top && "edge-top"].filter(Boolean).join(" ");
  return (
    <div ref={el} className={cls} style={style} data-pane={id}>
      {onClose && (
        <div className="tabbar ghost">
          <button type="button" className="tab active" tabIndex={-1}>
            <span className="tab-name">[No Name]</span>
            <span className="tab-close" title="Close" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} />
          </button>
        </div>
      )}
    </div>
  );
}
