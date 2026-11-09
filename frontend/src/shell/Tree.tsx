import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Entry, Files } from "../core/backend";
import { fileIcon, folderIcon } from "../theme/icons";

interface Row { path: string; name: string; dir: boolean; depth: number }
const ROW = 26; // px, fixed so we can window the rows by scrollTop

export interface TreeHandle {
  focus(): void;
  // Re-lists loaded folders touched by changed paths, all of them for null.
  refresh(paths: string[] | null): void;
  selected(): { path: string; dir: boolean } | null; // the row under the cursor
  reveal(path: string): Promise<void>; // opens its folders and puts the cursor on it
}

const parent = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0));

interface Props {
  files: Files;
  onOpen(path: string): void;
  onLeave(): void; // Esc: back to the editor
  onCommand(id: string): void; // file keys: a new, r rename, d trash, y/Y copy path, s reveal in Finder
}

const KEYS: Record<string, string> = {
  a: "file.new", r: "file.rename", d: "file.trash", y: "file.copyPath", Y: "file.copyAbsPath", s: "file.reveal",
};

// Virtualized file tree: folders load when first expanded, only the visible rows are in the DOM.
export const Tree = forwardRef<TreeHandle, Props>(function Tree({ files, onOpen, onLeave, onCommand }, ref) {
  const [children, setChildren] = useState(new Map<string, Entry[]>());
  const [expanded, setExpanded] = useState(new Set<string>());
  const [cursor, setCursor] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const el = useRef<HTMLDivElement>(null);
  const revealing = useRef<string | null>(null); // reveal's target, until its row exists

  const loaded = useRef(children);
  loaded.current = children;
  const current = useRef<Row | undefined>(undefined);

  // A folder that can't be listed (deleted) is forgotten, so it reloads fresh if it comes back.
  const load = (dir: string) =>
    files.list(dir).then(
      (es) => setChildren((m) => new Map(m).set(dir, es)),
      () => setChildren((m) => { const n = new Map(m); n.delete(dir); return n; }),
    );

  useImperativeHandle(ref, () => ({
    focus: () => el.current?.focus(),
    refresh(paths) {
      const dirs = paths ? new Set(paths.flatMap((p) => [p, parent(p)])) : null;
      for (const d of loaded.current.keys()) if (!dirs || dirs.has(d)) load(d);
    },
    selected: () => (current.current ? { path: current.current.path, dir: current.current.dir } : null),
    async reveal(path) {
      const dirs = path.split("/").slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join("/"));
      await Promise.all(["", ...dirs].map((d) => load(d))); // fresh lists: the file may be new
      setExpanded((s) => new Set([...s, ...dirs]));
      revealing.current = path;
    },
  }));
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
  current.current = rows[cur];

  // New rows (a save's temp file, a refresh) keep the cursor on its file, not on its row number; reveal moves it.
  const cursorPath = useRef<string | undefined>(undefined);
  useEffect(() => {
    const i = rows.findIndex((r) => r.path === (revealing.current ?? cursorPath.current));
    if (i >= 0 && revealing.current) revealing.current = null;
    if (i >= 0) setCursor(i);
  }, [rows]);
  useEffect(() => { cursorPath.current = rows[cur]?.path; }, [rows, cur]);

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
      default:
        if (!KEYS[e.key] || e.metaKey || e.ctrlKey || e.altKey) return;
        onCommand(KEYS[e.key]);
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
              style={{ top: i * ROW, height: ROW, paddingLeft: 8 + r.depth * 14 }}
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
