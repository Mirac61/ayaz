import { useEffect, useMemo, useRef, useState } from "react";
import { backend, type Info } from "../core/backend";
import { Commands } from "../core/commands";
import { defaultKeymap, keyName, mergeKeymap, parseKeys, parseUserKeymap, Sequencer, type Binding } from "../core/keymap";
import { isDirty } from "../core/buffers";
import { installVim } from "../editor/vim/setup";
import { browsable, resolveLink } from "../editor/mdlive";
import type { TermOptions } from "../terminal/terminal";
import { Editors, type Status } from "./editors";
import { borders, close, equalize, neighbor, panes, rects, resize, setBorder, split, type Dir, type Layout } from "./layout";
import { Picker, type Item, type PickerSource } from "./Picker";
import { Glyph, Tree, type TreeHandle } from "./Tree";
import { fileIcon, folderIcon } from "../theme/icons";
import "./shell.css";

// Wails rejects with an Error whose message is Go's error string.
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ":e! foo" → { force: true, rest: "foo" }
const bang = (arg = "") => {
  const force = arg.startsWith("!");
  return { force, rest: (force ? arg.slice(1) : arg).trim() };
};

const LIMIT = 50;
const STEP = 0.05; // <C-w>+/-/</>: share of the parent split (or of the window for the panel)
const clampPanel = (h: number) => Math.min(0.9, Math.max(0.1, h));
const PANEL = -1; // pane id of the bottom panel; split panes count up from 1

// One workspace: tree on the left, editor panes in splits, status line. Every action is a command (ADR-0010).
export function Workbench({ ws }: { ws: Info }) {
  const files = useMemo(() => backend.files(ws.id), [ws.id]);
  const [status, setStatus] = useState<Status>({ pane: 1, path: null, dirty: false, mode: "normal", line: 1, col: 1, lines: 1 });
  const lastSplit = useRef(1); // the split pane to go back to from the panel
  const ed = useMemo(() => new Editors(files, ws.root, (s) => {
    if (s.pane !== PANEL) lastSplit.current = s.pane;
    setStatus(s);
  }), [files, ws.root]);
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
  const [layout, setLayout] = useState<Layout>({ pane: 1 });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [picker, setPicker] = useState<PickerSource | null>(null);
  const [bindings, setBindings] = useState<Binding[] | null>(null);
  const tree = useRef<TreeHandle>(null);
  const splitFrom = useRef(new Map<number, number>()); // new pane → the pane it was split from
  const lay = useRef(layout);
  lay.current = layout;

  const commands = useMemo(() => new Commands(), []);
  const fail = (text: string) => setMsg({ text, error: true });
  const run = (id: string, arg?: string) =>
    void Promise.resolve().then(() => commands.run(id, arg)).catch((e) => fail(errText(e)));

  useEffect(() => {
    let showIgnored = false;
    const inTree = () => !!document.activeElement?.closest(".sidebar");

    const save = async (force: boolean) => {
      const b = ed.current();
      if (!b) return fail("No file name"), false;
      try {
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

    const quit = async (force: boolean) => {
      const d = ed.buffers.dirty();
      if (d.length && !force) return fail(`No write since last change for "${d[0].path}" (add ! to override)`);
      await backend.quit();
    };

    const closePane = async (force: boolean, id = ed.active) => {
      if (id === PANEL) {
        setPanel(null);
        return ed.focus(lastSplit.current);
      }
      const next = close(lay.current, id);
      if (!next) return quit(force);
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

    // A shell that exits closes its pane; the last pane turns back into an empty editor.
    const termExit = (id: number) => (panes(lay.current).length > 1 ? void closePane(true, id) : ed.replace(id));
    // An empty editor pane (no file) is taken over, otherwise the terminal splits off to the right.
    const termSplit = (cmd?: string) => {
      const target = ed.active === PANEL ? lastSplit.current : ed.active;
      if (ed.isEmpty(target)) return ed.replace(target, { ws: ws.id, cmd, onExit: () => termExit(target) });
      const id = splitPane("row", { ws: ws.id, cmd, onExit: () => termExit(id) });
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
      { id: "app.quit", title: "Quit (:qa)", run: (a) => quit(bang(a).force) },
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
      { id: "tree.focus", title: "Focus file tree", run: () => tree.current?.focus() },
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
      { id: "find.recent", title: "Recent files", run: () => setPicker(filePicker("Recent files", () => ed.recent())) },
      {
        id: "find.buffers",
        title: "Buffers",
        run: () => setPicker(filePicker("Buffers", () => ed.bufferList().map((b) => b.path),
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

    // The user's keymap.json goes on top of the defaults; a broken file keeps the defaults and says why.
    backend.keymap().then((text) => {
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
    return off;
  }, [ed]);

  // Changes on disk (git checkout, codegen, our own saves) reach the tree and the open buffers.
  useEffect(() => backend.onFsChanged(ws.id, async (c) => {
    const paths = c.rescan ? null : c.paths ?? [];
    tree.current?.refresh(paths);
    const note = await ed.diskChanged(paths);
    if (note) fail(note);
  }), [ed, ws.id]);

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
  return (
    <div className={max && panel === "shown" ? "workbench max" : "workbench"}>
      <aside className="sidebar">
        <div className="sidebar-title"><Glyph icon={folderIcon(true)} />{ws.name}</div>
        <Tree ref={tree} files={files} onOpen={(p) => run("file.open", p)} onLeave={() => ed.focus(ed.active)} />
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
              ed.attach(id, el, splitFrom.current.get(id), termFor.current.get(id));
              splitFrom.current.delete(id);
              termFor.current.delete(id);
              if (id === 1) tree.current?.focus(); // no file open yet, so start in the tree
              return () => ed.detach(id);
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
      <footer className="statusline">
        <span className={`seg mode ${status.mode}`}>{""} {status.mode.toUpperCase()}</span>
        <span className="seg file">
          {status.path && <Glyph icon={fileIcon(status.path)} />}
          {status.path ?? "[No Name]"}
          {status.dirty && <span className="dirty"> [+]</span>}
        </span>
        <span className={msg?.error ? "msg error" : "msg"}>{msg?.text}</span>
        <span className="seg progress">{status.line === 1 ? "Top" : status.line === status.lines ? "Bot" : `${Math.round((status.line / status.lines) * 100)}%`}</span>
        <span className={`seg location ${status.mode}`}>{status.line}:{status.col}</span>
      </footer>
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

// Opens the folder from the command line, otherwise asks for one.
export function Shell() {
  const [ws, setWs] = useState<Info | null | undefined>(undefined);
  const [err, setErr] = useState("");
  useEffect(() => void backend.initialWorkspace().then(setWs, (e) => { setErr(errText(e)); setWs(null); }), []);

  const pick = () => backend.openFolderDialog().then((w) => w && setWs(w), (e) => setErr(errText(e)));

  if (ws === undefined) return null;
  if (ws) return <Workbench ws={ws} />;
  return (
    <div className="welcome">
      <div>No folder open</div>
      <button autoFocus onClick={pick}>Open folder…</button>
      {err && <div style={{ color: "var(--samurai-red)" }}>{err}</div>}
    </div>
  );
}
