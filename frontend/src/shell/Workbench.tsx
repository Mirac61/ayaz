import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { backend, type Info } from "../core/backend";
import { Commands } from "../core/commands";
import { defaultKeymap, isMac, keyName, mergeKeymap, parseUserKeymap, Sequencer, type Binding } from "../core/keymap";
import { diff } from "../core/buffers";
import { parseProblems } from "../core/tasks";
import { Quickfix } from "../core/quickfix";
import { setLspMessages, installHint } from "../editor/lsp";
import { diagnosticsFor } from "../editor/diagnostics";
import { installVim } from "../editor/vim/setup";
import type { TermOptions } from "../terminal/terminal";
import { Editors, type Status } from "./editors";
import { borders, close, equalize, neighbor, panes, rects, resize, setBorder, split, type Dir, type Layout } from "./layout";
import { loadSettings, settings, settingsError } from "../core/settings";
import { Picker, type Item, type PickerSource } from "./Picker";
import { Tree, type TreeHandle } from "./Tree";
import { gitMarks, single } from "./gitstatus";
import { loadSession, mergeCursors, saveSession, type Session } from "./session";
import { folderIcon } from "../theme/icons";
import { bang, errText, inTree, LIMIT, type Ctx } from "./commands/context";
import { fileCommands } from "./commands/file";
import { findCommands } from "./commands/find";
import { gitCommands } from "./commands/git";
import { lspCommands } from "./commands/lsp";
import { quickfixTools } from "./commands/quickfix";
import { restoreTabs, viewCommands } from "./commands/view";
import { recentFolders } from "./folders";
import { Handle, Hints, Pane } from "./parts";
import "./shell.css";

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
  useEffect(() => restoreTabs(ed), [ed]);
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
      // A picker opened meanwhile (<Space>rr, a swap to restore) keeps the keys.
      if (document.activeElement?.closest(".picker")) return;
      if (Object.keys(session.panes).length) ed.focus(session.active);
      else tree.current?.focus();
    } finally {
      restoring.current--;
    }
  };

  const commands = useMemo(() => new Commands(), []);
  const qf = useMemo(() => new Quickfix(), []);
  const fail = (text: string) => setMsg({ text, error: true });
  const say = (text: string) => setMsg({ text });
  useEffect(() => setLspMessages(ws.id, (text, level) =>
    setMsg({ text, error: level === "error", warning: level === "warning" })), [ws.id]);
  const run = (id: string, arg?: string) =>
    void Promise.resolve().then(() => commands.run(id, arg)).catch((e) => fail(errText(e)));

  useEffect(() => {
    // Closes the window (ADR-0014: one workspace per window); the app quits after the last one.
    const quit = async (force: boolean) => {
      const d = ed.buffers.dirty();
      if (d.length && !force) return fail(`No write since last change for "${d[0].path}" (add ! to override)`);
      if (force) await ed.buffers.discardSwaps().catch(() => {}); // thrown away on purpose: nothing to restore
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
    const termSplit = (cmd?: string, more?: Partial<TermOptions>) => {
      const target = ed.active === PANEL ? lastSplit.current : ed.active;
      if (ed.isEmpty(target)) return ed.replace(target, { ws: ws.id, cmd, ...more });
      splitPane("row", { ws: ws.id, cmd, ...more });
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

    const prompt: Ctx["prompt"] = (title, initial, act) => {
      const back = inTree();
      setPicker({
        title,
        initial,
        query: async (q) => (q.trim() ? [{ label: q.trim() }] : []),
        pick: (it) => void act(it.label).then(() => back && tree.current?.focus(), (e) => fail(errText(e))),
      });
    };
    const c: Ctx = { ws, files, ed, qf, tree, run, say, fail, setPicker, prompt, closePane };
    const q = quickfixTools(c);

    // M52: a task runs in a split that stays open when it ends; file:line lines it printed go to the quickfix list.
    let lastTask: string | null = null;
    const runTask = (name: string) => {
      const cmd = settings().tasks[name];
      if (cmd === undefined) return fail(`No task "${name}" in settings.json`);
      lastTask = name;
      say(`Task "${name}": ${cmd}`);
      termSplit(cmd, {
        onExit: () => {}, // keep the pane and its output
        onOutput(text) {
          const locs = parseProblems(text, ws.root);
          if (locs.length) q.set(`Task "${name}"`, locs, false, false);
          else say(`Task "${name}" ended, no file:line in its output`);
        },
      });
    };

    const keysFor = (id: string) => bindingsRef.current?.find((b) => b.command === id)?.keys;

    const off = commands.register(
      ...fileCommands(c),
      ...findCommands(c, q),
      ...lspCommands(c, q),
      ...gitCommands(c),
      ...viewCommands(c),
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
      { id: "app.quit", title: "Close window (:qa)", run: (a) => quit(bang(a).force) },
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
      {
        id: "task.run",
        title: "Run a task (settings.json)",
        run() {
          const tasks = settings().tasks, names = Object.keys(tasks);
          if (!names.length) return fail('No tasks yet: add "tasks" to settings.json (Cmd+,)');
          setPicker({
            title: "Run task",
            query: async (q) => names.filter((n) => n.toLowerCase().includes(q.toLowerCase()))
              .map((n) => ({ label: n, hint: tasks[n] })),
            pick: (it) => runTask(it.label),
          });
        },
      },
      { id: "task.last", title: "Run the last task again", run: () => (lastTask ? runTask(lastTask) : fail("No task run yet: <Space>rr")) },
      { id: "term.normal", title: "Terminal normal mode", run: () => ed.termNormal() },
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

  // Hot exit (M49): every 2 s, unsaved text goes to a swap outside the project. A failing write says so once.
  useEffect(() => {
    let failed = "";
    const t = setInterval(() => void ed.buffers.syncSwaps().then(() => { failed = ""; }, (e) => {
      if (errText(e) !== failed) fail(`Unsaved changes not backed up: ${(failed = errText(e))}`);
    }), 2000);
    return () => clearInterval(t);
  }, [ed]);

  // Swaps a previous run left: one question per file whose text differs from disk. Esc keeps it for next time.
  useEffect(() => {
    let live = true;
    void files.swaps().then(async (list) => {
      const offer: typeof list = [];
      for (const s of list) {
        const disk = await files.readText(s.path).then((f) => f.content, () => "");
        if (disk === s.text) await files.swapRemove(s.path);
        else offer.push(s);
      }
      const next = () => {
        const s = offer.shift();
        if (!s || !live) return;
        setPicker({
          title: `"${s.path}" has unsaved changes from last time`,
          query: async () => [{ label: "Restore", hint: "as unsaved changes" }, { label: "Discard" }],
          pick: (_it, i) => void (i === 0
            ? ed.open(s.path).then(async () => {
              const b = await ed.edit(s.path, [diff(ed.buffers.get(s.path)!.state.doc.toString(), s.text)]);
              ed.buffers.adoptSwap(b);
            })
            : files.swapRemove(s.path)).catch((e) => fail(errText(e))),
          close: () => setTimeout(next), // after the picker that just closed is gone
        });
      };
      next();
    }, (e) => fail(`Unsaved changes from last time: ${errText(e)}`));
    return () => { live = false; };
  }, [ed]);

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
