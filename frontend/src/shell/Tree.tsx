import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Entry, Files } from "../core/backend";
import { fileIcon, folderIcon } from "../theme/icons";

interface Row { path: string; name: string; dir: boolean; depth: number }
const ROW = 24; // px, fixed so we can window the rows by scrollTop

export interface TreeHandle { focus(): void }

interface Props {
  files: Files;
  onOpen(path: string): void;
  onLeave(): void; // Esc: back to the editor
}

// Virtualized file tree: folders load when first expanded, only the visible rows are in the DOM.
export const Tree = forwardRef<TreeHandle, Props>(function Tree({ files, onOpen, onLeave }, ref) {
  const [children, setChildren] = useState(new Map<string, Entry[]>());
  const [expanded, setExpanded] = useState(new Set<string>());
  const [cursor, setCursor] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const el = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({ focus: () => el.current?.focus() }));

  const load = (dir: string) =>
    files.list(dir).then((es) => setChildren((m) => new Map(m).set(dir, es)), () => {});
  useEffect(() => void load(""), [files]);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setHeight(e.contentRect.height));
    ro.observe(el.current!);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (dir: string, depth: number) => {
      for (const e of children.get(dir) ?? []) {
        const path = dir ? `${dir}/${e.name}` : e.name;
        out.push({ path, name: e.name, dir: e.dir, depth });
        if (e.dir && expanded.has(path)) walk(path, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }, [children, expanded]);

  const cur = Math.min(cursor, Math.max(rows.length - 1, 0));

  // Keep the cursor row inside the viewport.
  useEffect(() => {
    const box = el.current;
    if (!box) return;
    if (cur * ROW < box.scrollTop) box.scrollTop = cur * ROW;
    else if ((cur + 1) * ROW > box.scrollTop + box.clientHeight) box.scrollTop = (cur + 1) * ROW - box.clientHeight;
  }, [cur]);

  const setOpen = (path: string, open: boolean) => {
    if (open && !children.has(path)) load(path);
    setExpanded((s) => {
      const n = new Set(s);
      open ? n.add(path) : n.delete(path);
      return n;
    });
  };

  const activate = (i: number, toggle: boolean) => {
    const r = rows[i];
    if (!r) return;
    if (!r.dir) onOpen(r.path);
    else setOpen(r.path, toggle ? !expanded.has(r.path) : true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const r = rows[cur];
    const go = (i: number) => setCursor(Math.max(0, Math.min(rows.length - 1, i)));
    switch (e.key) {
      case "j": case "ArrowDown": go(cur + 1); break;
      case "k": case "ArrowUp": go(cur - 1); break;
      case "g": go(0); break;
      case "G": go(rows.length - 1); break;
      case "Enter": case "o": activate(cur, true); break;
      case "l": case "ArrowRight": activate(cur, false); break;
      case "h": case "ArrowLeft":
        if (r?.dir && expanded.has(r.path)) setOpen(r.path, false);
        else if (r) go(rows.findIndex((x) => x.path === r.path.slice(0, r.path.lastIndexOf("/"))));
        break;
      case "Escape": onLeave(); break;
      default: return;
    }
    e.preventDefault();
  };

  const first = Math.floor(scrollTop / ROW);
  const visible = rows.slice(first, first + Math.ceil(height / ROW) + 1);

  return (
    <div
      ref={el}
      className="tree"
      tabIndex={0}
      role="tree"
      aria-label="Files"
      onKeyDown={onKeyDown}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: rows.length * ROW, position: "relative" }}>
        {visible.map((r, k) => {
          const i = first + k;
          return (
            <div
              key={r.path}
              role="treeitem"
              aria-selected={i === cur}
              aria-expanded={r.dir ? expanded.has(r.path) : undefined}
              className={i === cur ? "tree-row cursor" : "tree-row"}
              style={{ top: i * ROW, height: ROW, paddingLeft: 6 + r.depth * 16 }}
              onClick={() => { setCursor(i); activate(i, true); }}
            >
              <span className="tree-chevron" aria-hidden>{r.dir ? (expanded.has(r.path) ? "\uf47c" : "\uf460") : ""}</span>
              <Glyph icon={r.dir ? folderIcon(expanded.has(r.path)) : fileIcon(r.name)} />
              <span className={r.dir ? "tree-name dir" : "tree-name"}>{r.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const Glyph = ({ icon: [glyph, color] }: { icon: [string, string] }) => (
  <span className="glyph" style={{ color }} aria-hidden>{glyph}</span>
);
