import { useEffect, useMemo, useRef, useState } from "react";
import { backend, type Info } from "../core/backend";
import { Commands } from "../core/commands";
import { defaultKeymap, keyName, mergeKeymap, parseUserKeymap, Sequencer, type Binding } from "../core/keymap";
import { isDirty } from "../core/buffers";
import { installVim } from "../editor/vim/setup";
import { Editors, type Status } from "./editors";
import { close, neighbor, panes, rects, split, type Dir, type Layout } from "./layout";
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

// One workspace: tree on the left, editor panes in splits, status line. Every action is a command (ADR-0010).
export function Workbench({ ws }: { ws: Info }) {
  const files = useMemo(() => backend.files(ws.id), [ws.id]);
  const [status, setStatus] = useState<Status>({ pane: 1, path: null, dirty: false, mode: "normal", line: 1, col: 1, lines: 1 });
  const ed = useMemo(() => new Editors(files, ws.root, setStatus), [files, ws.root]);
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

    const closePane = async (force: boolean) => {
      const next = close(lay.current, ed.active);
      if (!next) return quit(force);
      const ids = panes(lay.current), i = ids.indexOf(ed.active);
      const target = ids[i + 1] ?? ids[i - 1]; // like Vim: the next window, else the previous
      ed.focus(target); // panes are siblings, so target stays mounted
      setLayout(next);
    };

    const splitPane = (dir: "row" | "col") => {
      const nid = Math.max(...panes(lay.current)) + 1;
      splitFrom.current.set(nid, ed.active);
      setLayout(split(lay.current, ed.active, dir, nid));
    };

    const move = (d: Dir) => {
      if (inTree()) return d === "right" && ed.focus(ed.active);
      const n = neighbor(lay.current, ed.active, d);
      if (n !== null) ed.focus(n);
      else if (d === "left") tree.current?.focus();
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
      { id: "app.quit", title: "Quit (:qa)", run: (a) => quit(bang(a).force) },
      { id: "pane.close", title: "Close pane (:q)", run: (a) => closePane(bang(a).force) },
      { id: "pane.splitDown", title: "Split pane down (:split)", run: () => splitPane("col") },
      { id: "pane.splitRight", title: "Split pane right (:vsplit)", run: () => splitPane("row") },
      { id: "pane.left", title: "Go to left pane", run: () => move("left") },
      { id: "pane.down", title: "Go to pane below", run: () => move("down") },
      { id: "pane.up", title: "Go to pane above", run: () => move("up") },
      { id: "pane.right", title: "Go to right pane", run: () => move("right") },
      { id: "tree.focus", title: "Focus file tree", run: () => tree.current?.focus() },
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
      installVim(run, all.filter((b) => b.context === "normal"));
      setBindings(all);
    }, (e) => {
      fail(errText(e));
      installVim(run, defaultKeymap().filter((b) => b.context === "normal"));
      setBindings(defaultKeymap());
    });
    return off;
  }, [ed]);

  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  // Keys outside the editor (tree) and global chords everywhere. Inside the editor, codemirror-vim runs the normal-mode bindings.
  useEffect(() => {
    if (!bindings || picker) return;
    const seq = new Sequencer((b) => run(b.command, b.arg));
    const global = bindings.filter((b) => b.context === "global");
    const onKey = (e: KeyboardEvent) => {
      const k = keyName(e);
      if (!k) return;
      const inEditor = (e.target as Element | null)?.closest?.(".cm-editor");
      if (seq.feed(k, inEditor ? global : bindings)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      seq.reset();
      window.removeEventListener("keydown", onKey, true);
    };
  }, [bindings, picker]);

  if (!bindings) return null;

  const rs = rects(layout);
  return (
    <div className="workbench">
      <aside className="sidebar">
        <div className="sidebar-title"><Glyph icon={folderIcon(true)} />{ws.name}</div>
        <Tree ref={tree} files={files} onOpen={(p) => run("file.open", p)} onLeave={() => ed.focus(ed.active)} />
      </aside>
      <div className="panes">
        {[...rs].map(([id, r]) => (
          <Pane
            key={id}
            id={id}
            active={id === status.pane}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            edge={{ left: r.x > 0, top: r.y > 0 }}
            mount={(el) => {
              ed.attach(id, el, splitFrom.current.get(id));
              splitFrom.current.delete(id);
              if (id === 1) tree.current?.focus(); // no file open yet, so start in the tree
              return () => ed.detach(id);
            }}
          />
        ))}
      </div>
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
      {picker && <Picker source={picker} onClose={() => { setPicker(null); if (!document.activeElement?.closest(".sidebar")) ed.focus(ed.active); }} />}
    </div>
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
