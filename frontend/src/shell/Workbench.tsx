import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { backend, type Grep, type Info } from "../core/backend";
import { Commands } from "../core/commands";
import { defaultKeymap, isMac, keyName, mergeKeymap, parseKeys, parseUserKeymap, Sequencer, type Binding } from "../core/keymap";
import { isDirty } from "../core/buffers";
import { label, Quickfix, replaceEdits, replacement, type Loc } from "../core/quickfix";
import { Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  closeLsp, codeActions, documentSymbols, hasLsp, installHint, noServer, references, renameAt, resolveAction, runCommand,
  setLspMessages, showHover, uriPath, workspaceSymbols, type CodeAction, type Sym,
} from "../editor/lsp";
import { diagnosticsFor } from "../editor/diagnostics";
import { nextDiagnostic, previousDiagnostic } from "@codemirror/lint";
import { moveHunk, previewHunk, resetHunk } from "../editor/gitgutter";
import { installVim } from "../editor/vim/setup";
import { browsable, resolveLink } from "../editor/mdlive";
import type { TermOptions } from "../terminal/terminal";
import { Editors, type Status } from "./editors";
import { borders, close, equalize, neighbor, panes, rects, resize, setBorder, split, type Dir, type Layout } from "./layout";
import { loadSettings, settings, settingsError } from "../core/settings";
import { Picker, type Item, type PickerSource } from "./Picker";
import { Tree, type TreeHandle } from "./Tree";
import { gitMarks, single } from "./gitstatus";
import { loadSession, mergeCursors, saveSession, type Session } from "./session";
import { fileIcon, folderIcon, symbolIcon } from "../theme/icons";
import "./shell.css";

// Wails rejects with an Error whose message is Go's error string.
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ":e! foo" → { force: true, rest: "foo" }
const bang = (arg = "") => {
  const force = arg.startsWith("!");
  return { force, rest: (force ? arg.slice(1) : arg).trim() };
};

const LIMIT = 50;
const SHOWN = 500; // project search hits listed in the picker; <C-q> takes all of them
const STEP = 0.05; // <C-w>+/-/</>: share of the parent split (or of the window for the panel)
const clampPanel = (h: number) => Math.min(0.9, Math.max(0.1, h));
const PANEL = -1; // pane id of the bottom panel; split panes count up from 1

// One workspace: tree on the left, editor panes in splits, status line. Every action is a command (ADR-0010).
// onSwitch opens another folder in this window: a root from the recent list, or null for the folder dialog.
// initial: a file to open in pane 1 after the session is back (settings.json in the settings window).
export function Workbench({ ws, onSwitch, initial }: { ws: Info; onSwitch(root: string | null): void; initial?: string }) {
  const files = useMemo(() => backend.files(ws.id), [ws.id]);
  const [status, setStatus] = useState<Status>({ pane: 1, path: null, dirty: false, mode: "normal", line: 1, col: 1, lines: 1 });
  const lastSplit = useRef(1); // the split pane to go back to from the panel
  const [session] = useState<Session | null>(() => loadSession(ws.root)); // how this folder looked last time
  const ed = useMemo(() => {
    const e = new Editors(files, ws.root, ws.id, (s) => {
      if (s.pane !== PANEL) lastSplit.current = s.pane;
      setStatus(s);
    });
    e.cursors = session?.cursors ?? {};
    return e;
  }, [files, ws.root, ws.id]);
  // null: no panel terminal; "hidden": it runs but isn't shown (Cmd+J toggles, like VS Code).
  const [panel, setPanel] = useState<"shown" | "hidden" | null>(null);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  // Panel height as a share of the window, kept per folder like recent files.
  const sizeKey = `ayaz.layout:${ws.root}`;
  const [panelH, setPanelH] = useState(() => {
    try {
      const h = JSON.parse(localStorage.getItem(sizeKey) ?? "{}")?.panel;
      return typeof h === "number" ? clampPanel(h) : 0.35;
    } catch {
      return 0.35; // storage blocked or corrupt
    }
  });
  useEffect(() => {
    try { localStorage.setItem(sizeKey, JSON.stringify({ panel: panelH })); } catch { /* a convenience */ }
  }, [panelH]);
  const [max, setMax] = useState(false); // the panel fills the editor area
  const panesEl = useRef<HTMLDivElement>(null);
  const panelEl = useRef<HTMLDivElement>(null);
  const termFor = useRef(new Map<number, TermOptions>()); // new pane → the terminal it runs
  const seq = useRef<Sequencer | null>(null);
  const [hints, setHints] = useState<{ keys: string[]; next: Binding[] } | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hintsShown = useRef(false);
  // which-key: after 200 ms in a sequence, show what may follow; once shown, follow along at once.
  const showHints = (keys: string[], next: Binding[]) => {
    clearTimeout(hintTimer.current);
    const set = (h: typeof hints) => { hintsShown.current = !!h; setHints(h); };
    if (!keys.length) return set(null);
    if (hintsShown.current) set({ keys, next });
    else hintTimer.current = setTimeout(() => set({ keys, next }), 200);
  };
  const [layout, setLayout] = useState<Layout>(session?.layout ?? { pane: 1 });
  const [msg, setMsg] = useState<{ text: string; error?: boolean; warning?: boolean } | null>(null);
  const [branch, setBranch] = useState("");
  const [diag, setDiag] = useState({ errors: 0, warnings: 0 });
  const [picker, setPicker] = useState<PickerSource | null>(null);
  const [bindings, setBindings] = useState<Binding[] | null>(null);
  const tree = useRef<TreeHandle>(null);
  const splitFrom = useRef(new Map<number, number>()); // new pane → the pane it was split from
  const previewNext = useRef(new Set<number>()); // new panes that turn into a Markdown preview once mounted
  const previews = useRef(new Set<number>()); // panes showing a preview
  const sidebarKey = "ayaz.sidebar";
  const [sidebar, setSidebar] = useState(() => {
    try { return localStorage.getItem(sidebarKey) !== "off"; } catch { return true; }
  });
  const [side, setSide] = useState(() => settings().sidebar);
  const [bar, setBar] = useState(() => settings().statusline);
  const sidebarOn = useRef(sidebar);
  sidebarOn.current = sidebar;
  // flushSync: the tree must be shown before it can take the focus.
  const showSidebar = (on: boolean) => {
    flushSync(() => setSidebar(on));
    try { localStorage.setItem(sidebarKey, on ? "on" : "off"); } catch { /* a convenience */ }
  };
  const tabsKey = "ayaz.tabs";
  useEffect(() => {
    try { ed.setTabs(localStorage.getItem(tabsKey) === "on"); } catch { /* default: no tabs */ }
  }, [ed]);
  const lay = useRef(layout);
  lay.current = layout;

  const restoring = useRef(0); // panes still opening their session file: saving now would forget it
  const saveNow = () => {
    if (restoring.current) return;
    const snap = ed.snapshot();
    ed.cursors = mergeCursors(ed.cursors, snap.cursors);
    saveSession(ws.root, { ...snap, layout: lay.current, cursors: ed.cursors, previews: [...previews.current] });
  };
  // Split, file, tab or cursor changed: save at most every 500 ms. Not a debounce: steady status updates
  // (a build writing files) would push it back forever. Leaving the folder saves at once.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    saveTimer.current ??= setTimeout(() => {
      saveTimer.current = undefined;
      saveNow();
    }, 500);
  }, [layout, status]);
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    saveNow();
    ed.dropHidden();
  }, [ed]);

  // A pane from the session gets its tabs and file back, once. A file that is gone by now is skipped.
  // Panes split off later aren't the session's: restoring them would pull the focus back to session.active.
  const unrestored = useRef(new Set(session ? panes(session.layout) : []));
  const restore = async (id: number) => {
    if (!session || !unrestored.current.delete(id)) return;
    if (session.tabs[id]) ed.setTabList(id, session.tabs[id]);
    const path = session.panes[id];
    restoring.current++;
    try {
      if (path) {
        await ed.open(path, id).catch(() => {});
        const b = ed.buffers.get(path);
        if (b && !b.mtime && !b.state.doc.length) await ed.moved(path, null);
        if (b && session.previews.includes(id)) {
          ed.focus(id);
          ed.toggleReading();
          previews.current.add(id);
        }
      }
      // Every pane is mounted by now (they mount in one commit). Without files, start in the tree as usual.
      if (Object.keys(session.panes).length) ed.focus(session.active);
      else tree.current?.focus();
    } finally {
      restoring.current--;
    }
  };

  const commands = useMemo(() => new Commands(), []);
  const qf = useMemo(() => new Quickfix(), []);
  const fail = (text: string) => setMsg({ text, error: true });
  useEffect(() => setLspMessages(ws.id, (text, level) =>
    setMsg({ text, error: level === "error", warning: level === "warning" })), [ws.id]);
  const run = (id: string, arg?: string) =>
    void Promise.resolve().then(() => commands.run(id, arg)).catch((e) => fail(errText(e)));

  useEffect(() => {
    let showIgnored = false;
    const inTree = () => !!document.activeElement?.closest(".sidebar");

    const save = async (force: boolean) => {
      const b = ed.current();
      if (!b) return fail("No file name"), false;
      try {
        await ed.format(); // no-op without a language server (Q25: on for Go)
        ed.cleanup();
        await ed.buffers.save(b, force);
        setMsg({ text: `"${b.path}" written` });
        ed.emit();
        return true;
      } catch (e) {
        fail(/changed on disk/.test(errText(e))
          ? `"${b.path}" changed on disk since it was read. :w! overwrites, :e! reloads`
          : errText(e));
        return false;
      }
    };

    // Closes the window (ADR-0014: one workspace per window); the app quits after the last one.
    const quit = async (force: boolean) => {
      const d = ed.buffers.dirty();
      if (d.length && !force) return fail(`No write since last change for "${d[0].path}" (add ! to override)`);
      saveNow();
      await backend.closeWindow();
    };

    const closePane = async (force: boolean, id = ed.active) => {
      if (id === PANEL) {
        setPanel(null);
        return ed.focus(lastSplit.current);
      }
      const next = close(lay.current, id);
      if (!next) return quit(force);
      if (force) ed.killTerm(id); // :q! ends a shell; :q only hides it
      const ids = panes(lay.current), i = ids.indexOf(id);
      const target = ids[i + 1] ?? ids[i - 1]; // like Vim: the next window, else the previous
      if (id === ed.active) ed.focus(target); // panes are siblings, so target stays mounted
      setLayout(next);
    };

    // Split panes only; from the panel, the split pane used last is split.
    const splitPane = (dir: "row" | "col", term?: TermOptions) => {
      const from = ed.active === PANEL ? lastSplit.current : ed.active;
      const nid = Math.max(...panes(lay.current)) + 1;
      if (term) termFor.current.set(nid, term);
      else splitFrom.current.set(nid, from);
      setLayout(split(lay.current, from, dir, nid));
      return nid;
    };

    // A shell that exits closes its pane (Editors finds the pane, it may have moved); the last pane turns back into an editor.
    ed.onTermExit = (id) => (panes(lay.current).length > 1 ? void closePane(true, id) : ed.replace(id));
    // An empty editor pane (no file) is taken over, otherwise the terminal splits off to the right.
    const termSplit = (cmd?: string) => {
      const target = ed.active === PANEL ? lastSplit.current : ed.active;
      if (ed.isEmpty(target)) return ed.replace(target, { ws: ws.id, cmd });
      splitPane("row", { ws: ws.id, cmd });
    };

    const togglePanel = () => {
      const p = panelRef.current;
      if (p === "shown") {
        setPanel("hidden");
        setMax(false);
        return ed.focus(lastSplit.current);
      }
      setPanel("shown");
      if (p === "hidden") requestAnimationFrame(() => ed.focus(PANEL)); // after display:none is gone; a new one focuses itself
    };

    const move = (d: Dir) => {
      if (inTree()) return d === "right" && ed.focus(ed.active);
      if (ed.active === PANEL) return d === "up" && ed.focus(lastSplit.current);
      const n = neighbor(lay.current, ed.active, d);
      if (n !== null) ed.focus(n);
      else if (d === "left") tree.current?.focus();
      else if (d === "down" && panelRef.current === "shown") ed.focus(PANEL);
    };

    // <C-w>+/-/</>; on the panel only the height changes.
    const grow = (dir: "row" | "col", d: number) => {
      if (ed.active === PANEL) return dir === "col" && setPanelH((h) => clampPanel(h + d));
      setLayout(resize(lay.current, ed.active, dir, d));
    };

    const toggleMax = () => {
      if (panelRef.current !== "shown") togglePanel();
      setMax((m) => !m);
      requestAnimationFrame(() => ed.focus(PANEL));
    };

    const filePicker = (title: string, list: () => string[], hint?: (p: string) => string | undefined): PickerSource => ({
      title,
      async query(q) {
        const all = list();
        const ms = q.trim() ? await backend.rank(all, q, LIMIT) : all.slice(0, LIMIT).map((path) => ({ path, positions: [] }));
        return ms.map((m) => ({ label: m.path, positions: m.positions ?? [], icon: fileIcon(m.path), hint: hint?.(m.path) }));
      },
      pick: (it) => run("file.open", it.label),
    });

    const locItem = (l: Loc): Item => ({ label: label(l), icon: fileIcon(l.path) });
    const jump = async (l: Loc) => {
      await ed.openAt(l.path, l.line, l.col);
      if (qf.items.includes(l)) setMsg({ text: `(${qf.index + 1} of ${qf.items.length}) ${l.text.trim()}` });
    };
    const qfMove = (d: number) => {
      if (!qf.items.length) return fail("No quickfix list");
      const l = qf.move(d);
      return l ? jump(l) : fail("No more items");
    };
    const qfPicker = (): PickerSource => ({
      title: `Quickfix: ${qf.title}`,
      query: async (q) => qf.items.filter((l) => !q || label(l).toLowerCase().includes(q.toLowerCase())).map(locItem),
      pick: (it) => {
        const i = qf.items.findIndex((l) => label(l) === it.label);
        if (i >= 0) void jump(qf.select(i));
      },
      start: Math.max(qf.index, 0),
    });
    const setQf = (title: string, locs: Loc[], regex = false, sort = true) => {
      qf.set(title, locs, regex, sort);
      if (!locs.length) return fail(`${title}: no matches`);
      setMsg({ text: `${title}: ${locs.length} matches, :cn / :cp to move, :copen to list` });
      void qfMove(1);
    };

    // Symbols in a picker. rank: fuzzy-rank by name here (a file's symbols); else the server already matched (project).
    // Items map to their symbol, so two symbols with one name (two `init`) both stay pickable.
    const symbolPicker = (title: string, load: (q: string) => Promise<Sym[]>, rank: boolean): PickerSource => {
      const sym = new WeakMap<Item, Sym>();
      const item = (s: Sym, positions: number[] = []): Item => {
        const it = { label: s.name, positions, icon: symbolIcon(s.kind), hint: rank ? s.container : `${s.path}:${s.line}` };
        sym.set(it, s);
        return it;
      };
      return {
        title,
        async query(q) {
          const all = await load(q);
          if (!rank || !q.trim()) return all.slice(0, SHOWN).map((s) => item(s));
          const byName = new Map<string, Sym[]>();
          for (const s of all) byName.set(s.name, [...(byName.get(s.name) ?? []), s]);
          const ms = await backend.rank([...byName.keys()], q, LIMIT);
          return ms.flatMap((m) => byName.get(m.path)!.map((s) => item(s, m.positions ?? [])));
        },
        pick: (it) => {
          const s = sym.get(it);
          if (s) void ed.openAt(s.path, s.line, s.col);
        },
      };
    };

    let grepRegex = false;
    const grepPicker = (): PickerSource => {
      let g: Grep | null = null, hits: Loc[] = [], q = "";
      const regex = grepRegex; // the quickfix list remembers it for :Replace's $1, $2
      return {
        title: `Search in files${regex ? " (regex)" : ""} · <C-q> to quickfix`,
        query(query, update) {
          g?.cancel();
          hits = [];
          q = query;
          if (!query.trim()) return Promise.resolve([]);
          const cur = (g = files.grep(query, { regex, ignored: showIgnored }, (h) => {
            hits.push(...h);
            update(hits.slice(0, SHOWN).map(locItem));
          }));
          cur.done.then((err) => err && cur === g && fail(err));
          return Promise.resolve([]);
        },
        pick: (_, i) => void (hits[i] && jump(hits[i])),
        all: () => setQf(`Search "${q}"`, hits, regex),
        close: () => g?.cancel(),
      };
    };

    // Fills in each location's line text from the open buffer or the file.
    const withText = async (locs: Loc[]) => {
      const docs = new Map<string, Text | null>();
      for (const l of locs) {
        if (!docs.has(l.path)) {
          const b = ed.buffers.get(l.path);
          docs.set(l.path, b ? b.state.doc : await files.readText(l.path).then((f) => Text.of(f.content.split("\n")), () => null));
        }
        const d = docs.get(l.path);
        if (d && l.line <= d.lines) l.text = d.line(l.line).text;
      }
      return locs;
    };

    // Replaces every quickfix match with `to`; buffers that were clean are saved, dirty ones stay open unsaved.
    const replaceAll = async (to: string) => {
      const byPath = new Map<string, Loc[]>();
      for (const l of qf.items) byPath.set(l.path, [...(byPath.get(l.path) ?? []), l]);
      let n = 0, skipped = 0;
      const unsaved: string[] = [];
      for (const [path, locs] of byPath) {
        const before = await ed.buffers.open(path);
        if (before.state.readOnly) { skipped += locs.length; continue; }
        const wasDirty = isDirty(before);
        const r = replaceEdits(locs, before.state.doc, to, qf.regex);
        skipped += r.skipped;
        if (!r.changes.length) continue;
        const b = await ed.edit(path, r.changes);
        n += r.changes.length;
        if (wasDirty) unsaved.push(path);
        else await ed.buffers.save(b);
      }
      ed.emit();
      setMsg({ text: `Replaced ${n} in ${byPath.size} files` + (skipped ? `, ${skipped} skipped (changed since the search)` : "") + (unsaved.length ? `; not saved (had changes): ${unsaved.join(", ")}` : "") });
    };

    // File commands act on the tree's row while the tree has focus, else on the active buffer.
    const target = () => {
      if (inTree()) return tree.current?.selected() ?? null;
      const b = ed.current();
      return b && !b.path.startsWith("/") ? { path: b.path, dir: false } : null; // not a library file outside the folder
    };
    const unsavedUnder = (path: string) =>
      ed.buffers.dirty().find((b) => b.path === path || b.path.startsWith(path + "/"));
    const dirOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0));
    // A one-line prompt in the picker: the item is what was typed, Enter runs act with it.
    const prompt = (title: string, initial: string, act: (text: string) => Promise<unknown>) => {
      const back = inTree();
      setPicker({
        title,
        initial,
        query: async (q) => (q.trim() ? [{ label: q.trim() }] : []),
        pick: (it) => void act(it.label).then(() => back && tree.current?.focus(), (e) => fail(errText(e))),
      });
    };

    // In a terminal: the terminal font only (every terminal); elsewhere the whole page.
    const zoomBy = async (d: number) => {
      if (ed.isTerm()) return setMsg({ text: `Terminal font ${ed.zoomTerms(Math.sign(d))} px` });
      const z = await setZoom(d ? zoomLevel() + d : 1);
      setMsg({ text: `Zoom ${Math.round(z * 100)} %` });
    };

    // Runs f on the active editor; fails with err when there is none or f finds nothing to do.
    const onView = (f: (v: EditorView) => boolean, err: string) => {
      const v = ed.activeView();
      if (!v || !f(v)) fail(err);
    };

    // @codemirror/lint selects the whole range, which puts Vim in visual mode; nvim's ]d lands on its start.
    const toDiagnostic = (cmd: (v: EditorView) => boolean) => (v: EditorView) => {
      if (!cmd(v)) return false;
      v.dispatch({ selection: { anchor: v.state.selection.main.from } });
      return true;
    };

    const keysFor = (id: string) => bindingsRef.current?.find((b) => b.command === id)?.keys;

    const off = commands.register(
      { id: "file.save", title: "Save file (:w)", run: (a) => save(bang(a).force) },
      { id: "file.saveClose", title: "Save and close pane (:wq)", run: async (a) => { if (await save(bang(a).force)) await closePane(bang(a).force); } },
      {
        id: "file.open",
        title: "Open file (:e)",
        async run(a) {
          const { force, rest } = bang(a);
          if (rest) return ed.open(rest.replace(/^\.\//, ""));
          const b = ed.current();
          if (!b) return;
          if (isDirty(b) && !force) return fail("No write since last change (add ! to override)");
          await ed.reload();
        },
      },
      {
        id: "file.new",
        title: "New file or folder",
        run() {
          const t = target();
          const dir = t ? (t.dir ? t.path : dirOf(t.path)) : "";
          const at = dir ? `${dir}/` : "";
          prompt(`New in ${at || "./"} · end with / for a folder`, at, async (path) => {
            const isDir = path.endsWith("/");
            const p = path.replace(/\/+$/, "").replace(/^\.\//, "");
            await files.create(p, isDir);
            await tree.current?.reveal(p);
            if (!isDir) await ed.open(p);
            setMsg({ text: `Created "${p}${isDir ? "/" : ""}"` });
          });
        },
      },
      {
        id: "file.rename",
        title: "Rename or move file",
        run() {
          const t = target();
          if (!t) return fail("No file to rename");
          const d = unsavedUnder(t.path);
          if (d) return fail(`"${d.path}" has unsaved changes: save first (:w)`);
          prompt(`Rename "${t.path}" to`, t.path, async (to) => {
            if (to === t.path) return;
            await files.rename(t.path, to);
            await ed.moved(t.path, to);
            await tree.current?.reveal(to);
            setMsg({ text: `Renamed to "${to}"` });
          });
        },
      },
      {
        id: "file.trash",
        title: "Move file to trash",
        run() {
          const t = target();
          if (!t) return fail("No file to delete");
          const d = unsavedUnder(t.path);
          if (d) return fail(`"${d.path}" has unsaved changes: save first (:w)`);
          const back = inTree();
          setPicker({
            title: `Move "${t.path}${t.dir ? "/" : ""}" to the trash? · Enter confirms, Esc cancels`,
            query: async () => [{ label: "Move to trash", icon: t.dir ? folderIcon(false) : fileIcon(t.path) }],
            pick: () => void files.trash(t.path).then(async () => {
              await ed.moved(t.path, null);
              setMsg({ text: `"${t.path}" moved to the trash` });
              if (back) tree.current?.focus();
            }, (e) => fail(errText(e))),
          });
        },
      },
      {
        id: "file.copyPath",
        title: "Copy relative path",
        async run() {
          const t = target();
          if (!t) return fail("No file");
          await backend.copy(t.path);
          setMsg({ text: `Copied "${t.path}"` });
        },
      },
      {
        id: "file.copyAbsPath",
        title: "Copy absolute path",
        async run() {
          const t = target();
          if (!t) return fail("No file");
          await backend.copy(`${ws.root}/${t.path}`);
          setMsg({ text: `Copied "${ws.root}/${t.path}"` });
        },
      },
      {
        id: "file.reveal",
        title: "Reveal in Finder",
        async run() {
          const t = target();
          if (!t) return fail("No file");
          await files.reveal(t.path);
        },
      },
      {
        id: "tree.revealCurrent",
        title: "Show current file in tree",
        async run() {
          const b = ed.current();
          if (!b || b.path.startsWith("/")) return fail("No file from this folder");
          await tree.current?.reveal(b.path);
          tree.current?.focus();
        },
      },
      {
        id: "link.browser",
        title: "Open link in browser (gx)",
        async run() {
          const t = ed.linkAtCursor();
          if (!t || !browsable(t)) return fail("No URL under the cursor");
          await backend.openURL(t);
        },
      },
      {
        id: "link.file",
        title: "Go to linked file (gf)",
        async run() {
          const b = ed.current(), t = ed.linkAtCursor();
          const p = b && t ? resolveLink(b.path, t) : null;
          if (!p) return fail("No relative file link under the cursor");
          await ed.open(p);
        },
      },
      {
        id: "md.preview",
        title: "Toggle Markdown preview in a split",
        run() {
          const b = ed.current();
          if (!b || !b.path.endsWith(".md")) return fail("The preview is for Markdown files");
          const open = [...previews.current].find((id) => ed.pathOf(id) === b.path);
          if (open !== undefined) return closePane(true, open);
          previewNext.current.add(splitPane("row"));
        },
      },
      {
        id: "view.sidebar",
        title: "Toggle file tree",
        run() {
          const on = !sidebarOn.current;
          if (!on && document.activeElement?.closest(".sidebar")) ed.focus(ed.active);
          showSidebar(on);
        },
      },
      {
        id: "view.tabs",
        title: "Toggle tab bar",
        run() {
          const on = !ed.tabsOn;
          ed.setTabs(on);
          try { localStorage.setItem(tabsKey, on ? "on" : "off"); } catch { /* a convenience */ }
        },
      },
      {
        id: "view.wrap",
        title: "Toggle line wrap",
        run() {
          const on = !ed.wrapped();
          ed.setWrap(on);
          setMsg({ text: on ? "Line wrap on" : "Line wrap off" });
        },
      },
      { id: "tab.next", title: "Next tab (gt)", run: () => ed.tabMove(1) },
      { id: "tab.prev", title: "Previous tab (gT)", run: () => ed.tabMove(-1) },
      { id: "tab.close", title: "Close tab", run: () => ed.tabClose() },
      { id: "tab.reopen", title: "Reopen closed tab", run: async () => { if (!(await ed.reopen())) fail("No closed tab"); } },
      { id: "nav.back", title: "Back to the previous file", run: async () => { if (!(await ed.nav(-1))) fail("At the start"); } },
      { id: "nav.forward", title: "Forward to the next file", run: async () => { if (!(await ed.nav(1))) fail("At the end"); } },
      {
        id: "md.reading",
        title: "Toggle reading view",
        run: () => { if (!ed.toggleReading()) fail("Reading view is for Markdown files"); },
      },
      { id: "app.quit", title: "Close window (:qa)", run: (a) => quit(bang(a).force) },
      { id: "window.new", title: "New window", run: () => backend.newWindow() },
      { id: "settings.open", title: "Open settings", run: () => backend.openSettings() },
      { id: "view.zoomIn", title: "Zoom in", run: () => zoomBy(ZOOM_STEP) },
      { id: "view.zoomOut", title: "Zoom out", run: () => zoomBy(-ZOOM_STEP) },
      { id: "view.zoomReset", title: "Reset zoom", run: () => zoomBy(0) },
      {
        id: "folder.switch",
        title: "Switch folder",
        run: () => setPicker({
          title: "Switch folder",
          async query(q) {
            const items = [{ label: "Open folder…", hint: "dialog" }, ...recentFolders().filter((f) => f.root !== ws.root).map((f) => ({ label: f.root, icon: folderIcon(false) }))];
            return items.filter((it) => !q || it.label.toLowerCase().includes(q.toLowerCase()));
          },
          pick(it) {
            const d = ed.buffers.dirty();
            if (d.length) return fail(`No write since last change for "${d[0].path}": save first (:w)`);
            onSwitch(it.hint === "dialog" ? null : it.label);
          },
        }),
      },
      { id: "pane.close", title: "Close pane (:q)", run: (a) => closePane(bang(a).force) },
      { id: "pane.splitDown", title: "Split pane down (:split)", run: () => splitPane("col") },
      { id: "pane.splitRight", title: "Split pane right (:vsplit)", run: () => splitPane("row") },
      { id: "pane.left", title: "Go to left pane", run: () => move("left") },
      { id: "pane.down", title: "Go to pane below", run: () => move("down") },
      { id: "pane.up", title: "Go to pane above", run: () => move("up") },
      { id: "pane.right", title: "Go to right pane", run: () => move("right") },
      { id: "pane.taller", title: "Pane taller (<C-w>+)", run: () => grow("col", STEP) },
      { id: "pane.shorter", title: "Pane shorter (<C-w>-)", run: () => grow("col", -STEP) },
      { id: "pane.wider", title: "Pane wider (<C-w>>)", run: () => grow("row", STEP) },
      { id: "pane.narrower", title: "Pane narrower (<C-w><)", run: () => grow("row", -STEP) },
      { id: "pane.equal", title: "Equal pane sizes (<C-w>=)", run: () => setLayout(equalize(lay.current)) },
      { id: "term.maximize", title: "Maximize terminal panel", run: toggleMax },
      {
        id: "tree.focus",
        title: "Focus file tree",
        run() {
          if (!sidebarOn.current) showSidebar(true);
          tree.current?.focus();
        },
      },
      { id: "term.panel", title: "Toggle terminal panel", run: togglePanel },
      { id: "term.split", title: "Terminal in a split (:terminal)", run: () => termSplit() },
      { id: "term.lazygit", title: "lazygit", run: () => termSplit("lazygit") },
      { id: "term.normal", title: "Terminal normal mode", run: () => ed.termNormal() },
      {
        id: "find.files",
        title: "Find files",
        run: () => setPicker({
          title: showIgnored ? "Files (incl. ignored)" : "Files",
          async query(q) {
            const ms = await files.find(q, LIMIT, showIgnored);
            return ms.map((m) => ({ label: m.path, positions: m.positions ?? [], icon: fileIcon(m.path) }));
          },
          pick: (it) => run("file.open", it.label),
        }),
      },
      {
        id: "find.toggleIgnored",
        title: "Toggle ignored files in Find files",
        run: () => setMsg({ text: (showIgnored = !showIgnored) ? "Find files: showing ignored files" : "Find files: hiding ignored files" }),
      },
      { id: "find.grep", title: "Search in files", run: () => setPicker(grepPicker()) },
      {
        id: "find.toggleRegex",
        title: "Toggle regex in Search in files",
        run: () => setMsg({ text: (grepRegex = !grepRegex) ? "Search in files: regex (Go RE2)" : "Search in files: literal" }),
      },
      { id: "qf.next", title: "Next quickfix entry (:cn)", run: () => qfMove(1) },
      { id: "qf.prev", title: "Previous quickfix entry (:cp)", run: () => qfMove(-1) },
      { id: "qf.open", title: "Quickfix list (:copen)", run: () => (qf.items.length ? setPicker(qfPicker()) : fail("No quickfix list")) },
      {
        id: "qf.replace",
        title: "Replace quickfix matches (:Replace text)",
        run(a) {
          if (!qf.items.length) return fail("No quickfix list; search first (<Space>fw, then <C-q>)");
          const to = a ?? "";
          const paths = new Set(qf.items.map((l) => l.path)).size;
          setPicker({
            title: `Replace ${qf.items.length} matches in ${paths} files with "${to}" · Enter applies all, Esc cancels`,
            query: async () => qf.items.map((l) => ({
              label: `${l.path}:${l.line}: ${(l.text.slice(0, l.col) + replacement(l, to, qf.regex) + l.text.slice(l.col + l.len)).trim()}`,
              icon: fileIcon(l.path),
            })),
            pick: () => run("qf.replaceNow", to),
          });
        },
      },
      { id: "qf.replaceNow", title: "Replace quickfix matches without preview", run: (a) => replaceAll(a ?? "") },
      {
        id: "lsp.references",
        title: "References (gr)",
        async run() {
          const v = ed.activeView();
          const locs = v && (await references(v, ws.root));
          if (!locs) return fail(noServer(ws.id, ed.current()?.path));
          setQf("References", await withText(locs));
        },
      },
      {
        id: "lsp.hover",
        title: "Hover info (K)",
        async run() {
          const v = ed.activeView();
          const r = v && (await showHover(v));
          if (r === null) fail(noServer(ws.id, ed.current()?.path));
          else if (!r) setMsg({ text: "No hover info here" });
        },
      },
      {
        id: "lsp.rename",
        title: "Rename symbol",
        run() {
          const v = ed.activeView();
          if (!v || !hasLsp(v)) return fail(noServer(ws.id, ed.current()?.path));
          const w = v.state.wordAt(v.state.selection.main.head);
          if (!w) return fail("No symbol under the cursor");
          prompt("Rename to", v.state.sliceDoc(w.from, w.to), async (name) => {
            const paths = await ed.applyEdit((await renameAt(v, name)) ?? {});
            setMsg({ text: paths.length ? `Renamed in ${paths.length} files` : "Nothing to rename" });
          });
        },
      },
      {
        id: "lsp.codeAction",
        title: "Code actions",
        async run() {
          const v = ed.activeView();
          const actions = v && (await codeActions(v, ws.id));
          if (!actions) return fail(noServer(ws.id, ed.current()?.path));
          if (!actions.length) return setMsg({ text: "No code actions here" });
          const byItem = new WeakMap<Item, CodeAction>();
          setPicker({
            title: "Code actions",
            async query(q) {
              const items = actions.map((a) => {
                const it = { label: a.title, hint: a.kind };
                byItem.set(it, a);
                return it;
              });
              return items.filter((it) => !q || it.label.toLowerCase().includes(q.toLowerCase()));
            },
            async pick(it) {
              try {
                const a = await resolveAction(v, byItem.get(it)!);
                if (a.edit) await ed.applyEdit(a.edit);
                if (a.command) await runCommand(v, a.command);
              } catch (e) {
                fail(errText(e));
              }
            },
          });
        },
      },
      {
        id: "lsp.symbols",
        title: "Symbols in file",
        async run() {
          const v = ed.activeView();
          const syms = v && (await documentSymbols(v, ws.root));
          if (!syms) return fail(noServer(ws.id, ed.current()?.path));
          setPicker(symbolPicker("Symbols in file", async () => syms, true));
        },
      },
      {
        id: "lsp.workspaceSymbols",
        title: "Symbols in project",
        run() {
          const v = ed.activeView();
          if (!v || !hasLsp(v)) return fail(noServer(ws.id, ed.current()?.path));
          setPicker(symbolPicker("Symbols in project", async (q) => (q.trim() ? (await workspaceSymbols(v, ws.root, q)) ?? [] : []), false));
        },
      },
      {
        id: "lsp.diagnostics",
        title: "Diagnostics in the folder",
        run() {
          const severity = ["", "error", "warning", "info", "hint"];
          const locs = diagnosticsFor(ws.id).all().flatMap((d): Loc[] => {
            const path = uriPath(ws.root, d.uri);
            if (path === null || path.startsWith("/")) return [];
            const text = `${severity[d.severity] ?? ""}: ${d.message.split("\n")[0]}`;
            return [{ path, line: d.line + 1, col: d.character, len: 0, text }];
          });
          if (!locs.length) return setMsg({ text: "No diagnostics" });
          setQf("Diagnostics", locs, false, false);
        },
      },
      { id: "lsp.nextDiagnostic", title: "Next diagnostic (]d)", run: () => onView(toDiagnostic(nextDiagnostic), "No diagnostics in this file") },
      {
        id: "lsp.prevDiagnostic",
        title: "Previous diagnostic ([d)",
        run: () => onView(toDiagnostic(previousDiagnostic), "No diagnostics in this file"),
      },
      { id: "git.nextHunk", title: "Next git hunk (]c)", run: () => onView((v) => moveHunk(v, 1), "No git changes in this file") },
      { id: "git.prevHunk", title: "Previous git hunk ([c)", run: () => onView((v) => moveHunk(v, -1), "No git changes in this file") },
      { id: "git.previewHunk", title: "Preview git hunk", run: () => onView(previewHunk, "No git change on this line") },
      { id: "git.resetHunk", title: "Reset git hunk", run: () => onView(resetHunk, "No git change on this line") },
      {
        id: "git.diff",
        title: "Toggle diff against HEAD",
        run: () => { if (!ed.toggleDiff()) fail("This file has no version at HEAD to compare with"); },
      },
      { id: "find.recent", title: "Recent files", run: () => setPicker(filePicker("Recent files", () => ed.recent())) },
      {
        id: "find.buffers",
        title: "Buffers",
        run: () => setPicker(filePicker("Buffers", () => [...ed.bufferList().map((b) => b.path), ...ed.hiddenTerms()],
          (p) => (ed.buffers.get(p) && isDirty(ed.buffers.get(p)!) ? "[+]" : undefined))),
      },
      {
        id: "find.commands",
        title: "Command palette",
        run: () => setPicker({
          title: "Commands",
          async query(q) {
            const cs = commands.list();
            const byTitle = new Map(cs.map((c) => [c.title, c]));
            const ms = q.trim() ? await backend.rank([...byTitle.keys()], q, LIMIT) : cs.map((c) => ({ path: c.title, positions: [] }));
            return ms.map((m): Item => ({ label: m.path, positions: m.positions ?? [], hint: keysFor(byTitle.get(m.path)!.id) }));
          },
          pick: (it) => {
            const c = commands.list().find((x) => x.title === it.label);
            if (c) run(c.id);
          },
        }),
      },
    );

    if (settingsError()) fail(settingsError());

    // The user's keymap.json goes on top of the defaults; a broken file keeps the defaults and says why.
    // Read again whenever it is saved, like settings.json.
    const loadKeymap = () => backend.keymap().then((text) => {
      let user: Binding[] = [];
      try {
        if (text.trim()) user = parseUserKeymap(text, (id) => commands.has(id));
      } catch (e) {
        fail(errText(e));
      }
      const all = mergeKeymap(defaultKeymap(), user);
      const normal = all.filter((b) => b.context === "normal");
      installVim(run, normal, (keys) => seq.current?.prime(keys, normal));
      setBindings(all);
    }, (e) => {
      fail(errText(e));
      const normal = defaultKeymap().filter((b) => b.context === "normal");
      installVim(run, normal, (keys) => seq.current?.prime(keys, normal));
      setBindings(defaultKeymap());
    });
    void loadKeymap();
    const offConfig = backend.onConfigChanged(async (file) => {
      if (file === "keymap.json") return void loadKeymap();
      loadSettings(await backend.settings().catch(() => ""));
      if (settingsError()) fail(settingsError());
      setSide(settings().sidebar);
      setBar(settings().statusline);
      ed.settingsChanged();
    });
    return () => {
      off();
      offConfig();
    };
  }, [ed]);

  // The tree's colors; asked again on every change on disk and in the repository, one `git status` at a time.
  const [git, setGit] = useState(() => gitMarks({}));
  const loadGit = useMemo(() => single(() => files.gitStatus().then((s) => setGit(() => gitMarks(s)))), [files]);

  // Changes on disk (git checkout, codegen, our own saves) reach the tree and the open buffers.
  useEffect(() => backend.onFsChanged(ws.id, async (c) => {
    const paths = c.rescan ? null : c.paths ?? [];
    tree.current?.refresh(paths);
    loadGit();
    const note = await ed.diskChanged(paths);
    if (note) fail(note);
  }), [ed, ws.id]);

  // A commit or checkout (lazygit in the terminal, too): new HEAD for the gutter, maybe a new branch.
  useEffect(() => {
    const load = () => {
      void files.gitBranch().then(setBranch, () => setBranch(""));
      loadGit();
    };
    load();
    return backend.onGitChanged(ws.id, () => {
      load();
      ed.gitChanged();
    });
  }, [ed, ws.id]);

  // E/W counts for the status line, from every server of this folder.
  useEffect(() => {
    const store = diagnosticsFor(ws.id);
    setDiag(store.counts());
    return store.onChange(() => setDiag(store.counts()));
  }, [ws.id]);

  // The window's close button: refuse while something is unsaved, like :qa.
  useEffect(() => backend.onCloseRequest(() => {
    const d = ed.buffers.dirty();
    if (d.length) fail(`Unsaved changes in "${d[0].path}": :w to save, :qa! to close anyway`);
    else {
      saveNow();
      void backend.closeWindow();
    }
  }), [ed]);

  useEffect(() => backend.onLspStatus(ws.id, (s) => {
    if (s.state === "missing") {
      fail(`${s.command} not found in PATH, no language features from it. Install: ${installHint(s.lang)}`);
    }
    if (s.state === "nocdb") setMsg({ text: "clangd: no compile_commands.json, flags are guessed (cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON, or bear -- make)" });
  }), [ws.id]);

  // Leaving the maximized panel (Ctrl-k, a picked file) brings the editors back.
  useEffect(() => { if (status.pane !== PANEL) setMax(false); }, [status.pane]);

  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  // Global chords everywhere; "normal" bindings in the tree and terminal normal mode; "terminal" ones in terminal mode.
  // Inside the editor, codemirror-vim runs the normal-mode bindings (and primes this Sequencer for prefixes).
  useEffect(() => {
    if (!bindings || picker) return;
    const s = (seq.current = new Sequencer((b) => run(b.command, b.arg), showHints));
    // In the editor, Vim runs the normal bindings; this one only follows along for the hints.
    let shadowOn = false;
    const shadow = new Sequencer(() => {}, (keys, next) => { shadowOn = keys.length > 0; showHints(keys, next); });
    const of = (...cs: string[]) => bindings.filter((b) => cs.includes(b.context));
    const global = of("global"), normal = of("global", "normal"), terminal = of("global", "terminal");
    const onKey = (e: KeyboardEvent) => {
      const k = keyName(e);
      const t = e.target as Element | null;
      if (!k || t?.tagName === "INPUT") return; // the terminal's search box
      const inEditor = !!t?.closest?.(".cm-editor");
      const term = t?.closest?.("[data-term]");
      const list = inEditor ? global : term?.getAttribute("data-mode") === "terminal" ? terminal : normal;
      if (s.feed(k, list)) {
        e.preventDefault();
        e.stopPropagation();
        shadow.reset();
      } else if (inEditor && (shadowOn || ed.vimIdle())) shadow.feed(k, of("normal"));
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      s.reset();
      shadow.reset();
      seq.current = null;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [bindings, picker]);

  if (!bindings) return null;

  const rs = rects(layout);
  const mode = <span className={`mode ${status.mode}`}>{status.mode}</span>;
  const dir = status.path?.slice(0, status.path.lastIndexOf("/") + 1);
  const file = (
    <span className="file" title={status.path ?? undefined}>
      {dir && <span className="dir">{dir}</span>}
      {status.path?.slice(dir?.length) ?? "[No Name]"}
      {status.dirty && <span className="dirty" title="Modified" />}
    </span>
  );
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  // Messages, then the counts that are not zero, the branch and the position: all plain text.
  const line = (
    <>
      <span className={msg?.error ? "msg error" : msg?.warning ? "msg warning" : "msg"}>{msg?.text}</span>
      <span className="meta">
        {(diag.errors > 0 || diag.warnings > 0) && (
          <button className="diag" title="Diagnostics (<Space>fd)" tabIndex={-1}
            onMouseDown={(e) => { e.preventDefault(); run("lsp.diagnostics"); }}>
            {diag.errors > 0 && <span className="e">{plural(diag.errors, "error")}</span>}
            {diag.warnings > 0 && <span className="w">{plural(diag.warnings, "warning")}</span>}
          </button>
        )}
        {branch && <span className="branch" title="Git branch">{branch}</span>}
        <span className="location">{status.info ?? `${status.line}:${status.col}`}</span>
      </span>
    </>
  );
  return (
    <div className={`workbench${max && panel === "shown" ? " max" : ""}${sidebar ? ` sidebar-${side}` : " nosidebar"} bar-${bar}`}
      data-ws={ws.id}>
      {/* "statusline": "top" puts mode, file and messages in the title bar, so the code gets the full height;
          "bottom" leaves the file there, centered like a window title, and the rest goes under the code. */}
      {bar === "top" ? (
        <header className={isMac ? "statusline mac" : "statusline"}>
          {mode}
          {file}
          {line}
        </header>
      ) : (
        <header className="titlebar">{file}</header>
      )}
      <aside className="sidebar" hidden={!sidebar}>
        <div className="sidebar-title">{ws.name}</div>
        <Tree
          ref={tree}
          files={files}
          onOpen={(p) => run("file.open", p)}
          git={git}
          onLeave={() => ed.focus(ed.active)}
          onCommand={(id) => run(id)}
        />
      </aside>
      <div className="panes" ref={panesEl}>
        {[...rs].map(([id, r]) => (
          <Pane
            key={id}
            id={id}
            active={id === status.pane}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            edge={{ left: r.x > 0, top: r.y > 0 }}
            mount={(el) => {
              const from = splitFrom.current.get(id);
              const cmd = unrestored.current.has(id) ? session?.terms[id] : undefined; // a terminal from the session
              ed.attach(id, el, from, termFor.current.get(id)
                ?? (cmd === undefined ? undefined : { ws: ws.id, cmd: cmd || undefined }));
              splitFrom.current.delete(id);
              termFor.current.delete(id);
              if (previewNext.current.delete(id)) {
                ed.toggleReading(); // the new pane is active; keep typing in the source
                previews.current.add(id);
                if (from !== undefined) { ed.focus(from); ed.syncScroll(from); }
              }
              if (id === 1 && initial) void restore(id).then(() => ed.open(initial, 1)).catch(() => {});
              else if (session) void restore(id);
              else if (id === 1) tree.current?.focus(); // no file open yet, so start in the tree
              return () => { previews.current.delete(id); ed.detach(id, true); };
            }}
          />
        ))}
        {borders(layout).map((b) => (
          <Handle
            key={`${b.path.join(".")}:${b.i}`}
            dir={b.dir}
            style={b.dir === "row"
              ? { left: `${b.at.x * 100}%`, top: `${b.at.y * 100}%`, height: `${b.at.h * 100}%` }
              : { top: `${b.at.y * 100}%`, left: `${b.at.x * 100}%`, width: `${b.at.w * 100}%` }}
            onDrag={(e) => {
              const box = panesEl.current!.getBoundingClientRect();
              const at = b.dir === "row" ? ((e.clientX - box.left) / box.width - b.r.x) / b.r.w : ((e.clientY - box.top) / box.height - b.r.y) / b.r.h;
              setLayout((l) => setBorder(l, b.path, b.i, at));
            }}
          />
        ))}
      </div>
      {panel && (
        <div className="panel" ref={panelEl} hidden={panel === "hidden"} style={{ height: `${panelH * 100}vh` }}>
          <Handle dir="col" style={{ top: 0, left: 0, right: 0 }} onDrag={(e) => {
            setMax(false);
            setPanelH(clampPanel((panelEl.current!.getBoundingClientRect().bottom - e.clientY) / window.innerHeight));
          }} />
          <Pane
            id={PANEL}
            active={status.pane === PANEL}
            style={{ inset: 0 }}
            edge={{ left: false, top: false }}
            mount={(el) => {
              ed.attach(PANEL, el, undefined, { ws: ws.id, onExit: () => {
                const focused = ed.active === PANEL;
                setPanel(null);
                if (focused) ed.focus(lastSplit.current);
              } });
              return () => ed.detach(PANEL);
            }}
          />
        </div>
      )}
      {bar === "bottom" && <footer className="statusline bottom">{mode}{line}</footer>}
      {hints && <Hints keys={hints.keys} next={hints.next} title={(id) => commands.list().find((c) => c.id === id)?.title ?? id} />}
      {picker && <Picker source={picker} onClose={() => { setPicker(null); if (!document.activeElement?.closest(".sidebar")) ed.focus(ed.active); }} />}
    </div>
  );
}

// The which-key box: one row per next key; a key that only leads further shows how many bindings follow.
function Hints({ keys, next, title }: { keys: string[]; next: Binding[]; title(id: string): string }) {
  const groups = new Map<string, Binding[]>();
  for (const b of next) {
    const k = parseKeys(b.keys)[keys.length];
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  return (
    <div className="hints" role="status" aria-label="Next keys">
      <div className="hints-title">{keys.join("")}</div>
      <ul>
        {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([k, bs]) => {
          const exact = bs.find((b) => parseKeys(b.keys).length === keys.length + 1);
          const more = bs.length - (exact ? 1 : 0);
          return (
            <li key={k}>
              <kbd>{k}</kbd>
              <span className={exact ? "" : "group"}>
                {exact ? title(exact.command) : `+${more} keymap${more > 1 ? "s" : ""}`}
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
function Handle({ dir, style, onDrag }: { dir: "row" | "col"; style: React.CSSProperties; onDrag(e: PointerEvent): void }) {
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

interface PaneProps {
  id: number;
  active: boolean;
  style: React.CSSProperties;
  edge: { left: boolean; top: boolean };
  mount(el: HTMLDivElement): () => void;
}

// Panes are siblings positioned from the layout rects, so a split never remounts an existing editor.
function Pane({ id, active, style, edge, mount }: PaneProps) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => mount(el.current!), []);
  const cls = ["pane", active && "active", edge.left && "edge-left", edge.top && "edge-top"].filter(Boolean).join(" ");
  return <div ref={el} className={cls} style={style} data-pane={id} />;
}

// Page zoom for every window (same origin), like VS Code's: the whole UI scales, terminal and PDFs included.
// A focused terminal zooms its font instead (Editors.zoomTerms).
const ZOOM_KEY = "ayaz.zoom", ZOOM_STEP = 0.1;
function zoomLevel(): number {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    return z >= 0.5 && z <= 2 ? z : 1;
  } catch {
    return 1; // storage blocked
  }
}
async function setZoom(z: number) {
  z = Math.round(Math.min(2, Math.max(0.5, z)) * 10) / 10;
  try { localStorage.setItem(ZOOM_KEY, String(z)); } catch { /* a convenience */ }
  await backend.zoom(z);
  return z;
}

// Folders opened in any window, most recent first (shared by all windows: same origin).
const FOLDERS_KEY = "ayaz.folders";
function recentFolders(): { root: string; name: string }[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((f) => typeof f?.root === "string" && typeof f?.name === "string") : [];
  } catch {
    return []; // storage blocked or corrupt
  }
}
function rememberFolder(w: Info) {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify([{ root: w.root, name: w.name }, ...recentFolders().filter((f) => f.root !== w.root)].slice(0, 20)));
  } catch { /* a convenience */ }
}

// The keys to know first, for the welcome page; from the default keymap (the user's keymap.json is read later).
const keysOf = (...ids: string[]) => defaultKeymap().filter((b) => ids.includes(b.command)).map((b) => b.keys);
const FIRST_KEYS: [keys: string[], what: string][] = [
  [keysOf("find.files"), "Find files"],
  [keysOf("find.grep"), "Search in files"],
  [keysOf("find.commands"), "All commands and their keys"],
  [keysOf("tree.focus"), "File tree"],
  [keysOf("term.panel"), "Terminal"],
  [keysOf("pane.splitRight", "pane.splitDown"), "Split down, right"],
  [["gd", "gr", "K"], "Definition, references, hover"],
  [keysOf("lsp.rename", "lsp.codeAction"), "Rename, code actions"],
  [[":w", ":q"], "Save, close"],
];

// Opens the folder from the command line (first window only), otherwise shows recent folders and the dialog.
export function Shell() {
  const settingsWindow = new URLSearchParams(location.search).has("settings");
  const [ws, setWs] = useState<Info | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const show = (w: Info | null) => { if (w) rememberFolder(w); setWs(w); };
  useEffect(() => {
    if (zoomLevel() !== 1) void setZoom(zoomLevel()).catch(() => {}); // no window zoom in the server build
    if (new URLSearchParams(location.search).has("new")) return setWs(null); // a new window starts empty
    const failed = (e: unknown) => { setErr(errText(e)); setWs(null); };
    // The settings window isn't a recent folder.
    if (settingsWindow) return void backend.configFolder().then(backend.openFolder).then(setWs, failed);
    backend.initialWorkspace().then(show, failed);
  }, []);

  const open = (root: string | null) => (root ? backend.openFolder(root) : backend.openFolderDialog());
  const pick = (root: string | null) => open(root).then((w) => w && show(w), (e) => setErr(errText(e)));

  // Another folder in this window: open the new one first (the dialog may be cancelled), then tear the old one down.
  const switchTo = (root: string | null) => {
    const old = ws;
    open(root).then((w) => {
      if (!w || !old) return;
      show(w);
      closeLsp(old.id);
      void backend.closeWorkspace(old.id);
    }, (e) => setErr(errText(e)));
  };

  if (ws === undefined) return null;
  if (ws) return <Workbench key={ws.id} ws={ws} onSwitch={switchTo} initial={settingsWindow ? "settings.json" : undefined} />;
  const recent = recentFolders().slice(0, 9);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "," && (isMac ? e.metaKey : e.ctrlKey)) return void backend.openSettings(); // no keymap here
    const f = recent[Number(e.key) - 1]; // 1–9 open a recent folder
    if (f && !e.metaKey && !e.ctrlKey) pick(f.root);
  };
  return (
    <div className="welcome" onKeyDown={onKey}>
      <div className="titlebar">Ayaz</div>
      <div className="welcome-card">
        <div className="welcome-list">
          <div>
            <div className="welcome-title">No folder open</div>
            <div className="welcome-sub">Open a folder or pick one of the recent ones.</div>
          </div>
          {recent.length > 0 && (
            <nav aria-label="Recent folders">
              <div className="welcome-label">Recent</div>
              {recent.map((f, i) => (
                <button key={f.root} onClick={() => pick(f.root)} title={f.root} autoFocus={i === 0}>
                  <kbd aria-hidden>{i + 1}</kbd>
                  <span className="welcome-name">{f.name}</span>
                  <span className="welcome-path">{f.root}</span>
                </button>
              ))}
            </nav>
          )}
          <nav aria-label="Start">
            <div className="welcome-label">Start</div>
            <button autoFocus={!recent.length} onClick={() => pick(null)}>Open folder…</button>
          </nav>
          <section aria-label="Keys">
            <div className="welcome-label">Keys</div>
            {FIRST_KEYS.map(([keys, what]) => (
              <div key={what} className="welcome-key">
                <span className="welcome-chips">{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
                <span>{what}</span>
              </div>
            ))}
          </section>
          {err && <div className="welcome-err">{err}</div>}
        </div>
      </div>
    </div>
  );
}
