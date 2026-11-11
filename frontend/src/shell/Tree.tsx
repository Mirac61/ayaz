import { startDrag } from "./dnd";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Entry, Files } from "../core/backend";
import { fileIcon, folderIcon } from "../theme/icons";
import { ContextMenu, type MenuItem } from "../ui/ui";

interface Row { path: string; name: string; dir: boolean; depth: number }
const ROW = 28; // px, fixed so we can window the rows by scrollTop
const OVERSCAN = 20; // rows drawn beyond the viewport on each side, so a fast scroll finds rows already there

export interface TreeHandle {
  focus(): void;
  // Re-lists loaded folders touched by changed paths, all of them for null.
  refresh(paths: string[] | null): void;
  selected(): { path: string; dir: boolean } | null; // the row under the cursor
  reveal(path: string): Promise<void>; // opens its folders and puts the cursor on it
  collapseAll(): void;
}

const parent = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0));

// The filter's matches as tree rows: each file under its folders, all open, folders first and by name like the list.
export function filterRows(paths: string[]): Row[] {
  const kids = new Map<string, Map<string, boolean>>(); // folder → name → is a folder
  for (const p of paths) {
    const parts = p.split("/");
    parts.forEach((name, i) => {
      const dir = parts.slice(0, i).join("/");
      if (!kids.has(dir)) kids.set(dir, new Map());
      kids.get(dir)!.set(name, kids.get(dir)!.get(name) || i < parts.length - 1);
    });
  }
  const out: Row[] = [];
  const walk = (dir: string, depth: number) => {
    const es = [...(kids.get(dir) ?? [])].sort(([a, ad], [b, bd]) => (ad !== bd ? (ad ? -1 : 1) : a < b ? -1 : 1));
    for (const [name, isDir] of es) {
      const path = dir ? `${dir}/${name}` : name;
      out.push({ path, name, dir: isDir, depth });
      if (isDir) walk(path, depth + 1);
    }
  };
  walk("", 0);
  return out;
}

const FILTER_LIMIT = 200;

interface Props {
  files: Files;
  onOpen(path: string): void;
  onLeave(): void; // Esc: back to the editor
  onCommand(id: string, arg?: string): void; // file keys: a new, r rename, d trash, y/Y copy path, s reveal in Finder
  git(path: string): string | undefined; // git state for the name's color (gitstatus.ts)
}

const GIT_CLASS: Record<string, string> = { M: " git-mod", A: " git-add", "?": " git-add", U: " git-conflict", "!": " git-ignored" };
export const GIT_BADGE: Record<string, string> = { M: "M", A: "A", "?": "U", U: "C" };

const KEYS: Record<string, string> = {
  a: "file.new", r: "file.rename", d: "file.trash", y: "file.copyPath", Y: "file.copyAbsPath", s: "file.reveal",
};

// Virtualized file tree: folders load when first expanded, only the visible rows are in the DOM.
export const Tree = forwardRef<TreeHandle, Props>(function Tree({ files, onOpen, onLeave, onCommand, git }, ref) {
  const [children, setChildren] = useState(new Map<string, Entry[]>());
  const [expanded, setExpanded] = useState(new Set<string>());
  const [cursor, setCursor] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const el = useRef<HTMLDivElement>(null);
  const revealing = useRef<string | null>(null); // reveal's target, until its row exists
  // "/": the project's files matching the text (the same fuzzy search as <Space>ff), shown as a tree. null: off.
  const [filter, setFilter] = useState<string | null>(null);
  const [found, setFound] = useState<string[]>([]);
  // The latest answer, set before React renders it: an Enter right after it must not count as early.
  const answer = useRef({ q: "", paths: [] as string[] });
  const early = useRef(false); // Enter came before the answer: go to the first file once it's there
  const input = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

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
    collapseAll: () => setExpanded(new Set()),
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
    if (!filter) return setFound([]);
    let stale = false;
    files.find(filter, FILTER_LIMIT, false).then((ms) => {
      if (stale) return;
      const paths = ms.map((m) => m.path);
      answer.current = { q: filter, paths };
      setFound(paths);
      if (early.current) revealing.current = filterRows(paths).find((r) => !r.dir)?.path ?? null;
      early.current = false;
    }, () => {});
    return () => { stale = true; };
  }, [filter, files]);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setHeight(e.contentRect.height));
    ro.observe(el.current!);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(() => {
    if (filter) return filterRows(found);
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
  }, [children, expanded, filter, found]);

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
    if (!r || (filter && r.dir)) return; // filtered folders stay open
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
      case "/": setFilter(filter ?? ""); setTimeout(() => input.current?.select()); break;
      case "h": case "ArrowLeft":
        if (filter) go(rows.findIndex((x) => x.path === parent(r?.path ?? "")));
        else if (r?.dir && expanded.has(r.path)) setOpen(r.path, false);
        else if (r) go(rows.findIndex((x) => x.path === r.path.slice(0, r.path.lastIndexOf("/"))));
        break;
      case "Escape": if (filter === null) onLeave(); else setFilter(null); break;
      default:
        if (!KEYS[e.key] || e.metaKey || e.ctrlKey || e.altKey) return;
        onCommand(KEYS[e.key]);
    }
    e.preventDefault();
  };

  // Right click: the row under the pointer becomes the cursor, the menu lists what the keys a, r, d, y, Y and s do to it.
  const openMenu = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    const r = rows[i];
    setCursor(i);
    el.current?.focus(); // the file commands act on the tree's cursor row while the tree has the focus
    const cmd = (label: string, id: string, hint?: string, arg?: string): MenuItem =>
      ({ label, hint, run: () => onCommand(id, arg) });
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...(r.dir ? [] : [{ label: "Open", hint: "Enter", run: () => onOpen(r.path) }]),
        cmd("New file…", "file.new", "a"),
        cmd("New folder…", "file.new", undefined, "dir"),
        cmd("Rename…", "file.rename", "r"),
        cmd("Copy relative path", "file.copyPath", "y"),
        cmd("Copy absolute path", "file.copyAbsPath", "Y"),
        cmd("Reveal in Finder", "file.reveal", "s"),
        cmd("Move to trash…", "file.trash", "d"),
      ],
    });
  };

  const first = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const visible = rows.slice(first, first + Math.ceil(height / ROW) + 2 * OVERSCAN);

  // In the box: Enter and the arrows go to the rows, Esc ends the filter.
  const onFilterKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setFilter(null);
    else if (e.key !== "Enter" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const a = answer.current;
    early.current = !!filter && a.q !== filter;
    if (filter && !early.current && a.paths !== found) revealing.current = filterRows(a.paths).find((r) => !r.dir)?.path ?? null;
    else setCursor(Math.max(rows.findIndex((r) => !r.dir), 0));
    el.current?.focus();
  };

  return (
    <>
      {filter !== null && (
        <input
          ref={input}
          className="tree-filter"
          aria-label="Filter files"
          placeholder="Filter"
          value={filter}
          autoFocus
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={onFilterKey}
        />
      )}
      <div
        ref={el}
        className="tree"
        tabIndex={0}
        role="tree"
        aria-label="Files"
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          // The window of rows moves only after a few rows of scrolling, and at once (before the frame is drawn): an
          // update React schedules for later would show an empty stretch while the scroll runs ahead of it.
          const top = e.currentTarget.scrollTop;
          if (Math.abs(top - scrollTop) >= (OVERSCAN / 2) * ROW) flushSync(() => setScrollTop(top));
        }}
      >
        <div style={{ height: rows.length * ROW, position: "relative" }}>
          {visible.map((r, k) => {
            const i = first + k;
            const gitMark = git(r.path);
            const name = (r.dir ? "tree-name dir" : "tree-name") + (GIT_CLASS[gitMark ?? ""] ?? "");
            const badge = gitMark ? GIT_BADGE[gitMark] : undefined;
            const open = r.dir && (filter !== null || expanded.has(r.path));
            return (
              <div
                key={r.path}
                role="treeitem"
                aria-selected={i === cur}
                aria-expanded={r.dir ? open : undefined}
                className={i === cur ? "tree-row cursor" : "tree-row"}
                style={{ top: i * ROW, height: ROW, paddingLeft: 8 + r.depth * 16, ...{ "--depth": r.depth } }}
                onMouseDown={r.dir ? undefined : (e) => startDrag(e, r.path)}
                onClick={() => { setCursor(i); activate(i, true); }}
                onContextMenu={(e) => openMenu(e, i)}
              >
                <span className="tree-chevron" aria-hidden>{r.dir ? (open ? "\uf47c" : "\uf460") : ""}</span>
                <Glyph icon={r.dir ? folderIcon(open, r.name) : fileIcon(r.name)} />
                <span className={name}>{r.name}</span>
                {badge && gitMark && (
                  <span className={`tree-git-badge ${GIT_CLASS[gitMark]?.trim()}`} aria-hidden>
                    {badge}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {menu && <ContextMenu at={menu} items={menu.items} onClose={() => setMenu(null)} />}
    </>
  );
});

export const Glyph = ({ icon: [glyph, color] }: { icon: [string, string] }) => (
  <span className="glyph" style={{ color }} aria-hidden>{glyph}</span>
);
