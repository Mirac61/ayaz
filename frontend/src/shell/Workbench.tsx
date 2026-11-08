import { useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";
import { backend, type Info } from "../core/backend";
import { Buffers, isDirty, type Buffer } from "../core/buffers";
import { createState } from "../editor/editor";
import { installVim } from "../editor/vim/setup";
import { Tree, type TreeHandle } from "./Tree";
import "./shell.css";

// Wails rejects with an Error whose message is Go's error string.
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// One workspace: tree on the left, one editor, status line. Splits come in M2.
export function Workbench({ ws }: { ws: Info }) {
  const files = useMemo(() => backend.files(ws.id), [ws.id]);
  const editorEl = useRef<HTMLDivElement>(null);
  const tree = useRef<TreeHandle>(null);
  const [path, setPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState("normal");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const open = useRef<(path: string) => void>(() => {});

  useEffect(() => {
    const buffers = new Buffers(files, createState);
    let cur: Buffer | null = null;
    let view: EditorView | null = null;
    let cancelled = false;
    const fail = (text: string) => setMsg({ text, error: true });

    // setState recreates the vim plugin, so the mode listener is attached again each time.
    const watchMode = (v: EditorView) =>
      getCM(v)?.on("vim-mode-change", (e: { mode: string }) => setMode(e.mode));

    const show = (b: Buffer) => {
      if (!view) return;
      cur = b;
      view.setState(b.state);
      watchMode(view);
      setPath(b.path);
      setDirty(isDirty(b));
      setMode("normal");
      view.focus();
    };
    open.current = (p) => buffers.open(p).then(show, (e) => fail(errText(e)));

    installVim({
      async write(force) {
        if (!cur) return fail("No file name"), false;
        try {
          await buffers.save(cur, force);
          setDirty(false);
          setMsg({ text: `"${cur.path}" written` });
          return true;
        } catch (e) {
          fail(/changed on disk/.test(errText(e))
            ? `"${cur.path}" changed on disk since it was read. :w! overwrites, :e! reloads`
            : errText(e));
          return false;
        }
      },
      async edit(p, force) {
        try {
          if (p) return show(await buffers.open(p.replace(/^\.\//, "")));
          if (!cur) return;
          if (isDirty(cur) && !force) return fail("No write since last change (add ! to override)");
          show(await buffers.load(cur.path));
        } catch (e) {
          fail(errText(e));
        }
      },
      async quit(force) {
        const d = buffers.dirty();
        if (d.length && !force) return fail(`No write since last change for "${d[0].path}" (add ! to override)`);
        await backend.quit();
      },
      focusTree: () => tree.current?.focus(),
    });

    createState(null, "").then((state) => {
      if (cancelled) return;
      view = new EditorView({
        parent: editorEl.current!,
        state,
        dispatchTransactions(trs, v) {
          v.update(trs);
          if (cur) {
            cur.state = v.state;
            setDirty(isDirty(cur));
          }
        },
      });
      watchMode(view);
      tree.current?.focus(); // no file open yet, so start in the tree
    });
    return () => {
      cancelled = true;
      view?.destroy();
    };
  }, [files]);

  return (
    <div className="workbench">
      <Tree ref={tree} files={files} onOpen={(p) => open.current(p)} onLeave={() => editorEl.current?.querySelector<HTMLElement>(".cm-content")?.focus()} />
      <div className="editor" ref={editorEl} />
      <div className="statusline">
        <span className={`mode ${mode}`}>{mode.toUpperCase()}</span>
        <span>{ws.name}/{path ?? "[No Name]"}{dirty ? " [+]" : ""}</span>
        {msg && <span className={msg.error ? "msg error" : "msg"}>{msg.text}</span>}
      </div>
    </div>
  );
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
