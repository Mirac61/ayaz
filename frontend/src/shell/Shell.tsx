import { useEffect, useState } from "react";
import { backend, type Info } from "../core/backend";
import { defaultKeymap, isMac } from "../core/keymap";
import { closeLsp } from "../editor/lsp";
import { errText } from "./commands/context";
import { rememberFolder, recentFolders } from "./folders";
import { Picker, type PickerSource } from "./Picker";
import { folderIcon } from "../theme/icons";
import { setZoom, zoomLevel } from "./zoom";
import { Workbench } from "./Workbench";
import { AyazLogo } from "./AyazLogo";

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
  const [picker, setPicker] = useState<PickerSource | null>(null);
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
  const openRecentPicker = () => setPicker({
    title: "Switch folder",
    async query(q) {
      const recent = recentFolders().map((f) => ({ label: f.root, icon: folderIcon(false) }));
      const items = [...recent, { label: "Open folder…", hint: "dialog", icon: folderIcon(true) }];
      return items.filter((it) => !q || it.label.toLowerCase().includes(q.toLowerCase()));
    },
    pick: (it) => void pick(it.hint === "dialog" ? null : it.label),
  });
  return (
    <div className="welcome" onKeyDown={onKey}>
      <div className="titlebar">
        <button type="button" className="titlebar-project" tabIndex={-1} onClick={openRecentPicker}>
          <span className="titlebar-project-name">Open Recent Project</span>
        </button>
      </div>
      <div className="welcome-card">
        <div className="welcome-list">
          <div className="welcome-brand">
            <AyazLogo size={56} className="welcome-logo" />
            <div className="welcome-brand-text">
              <div className="welcome-title">ayaz</div>
              <div className="welcome-sub">A keyboard-first editor. Open a folder to start.</div>
            </div>
          </div>
          <div className="welcome-cols">
            <div className="welcome-col">
            {recent.length > 0 && (
              <nav aria-label="Recent folders">
                <div className="welcome-label label">Recent</div>
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
              <div className="welcome-label label">Start</div>
              <button className="primary" autoFocus={!recent.length} onClick={() => pick(null)}>Open folder…</button>
            </nav>
            </div>
            <section aria-label="Keys">
              <div className="welcome-label label">Keys</div>
              {FIRST_KEYS.map(([keys, what]) => (
                <div key={what} className="welcome-key">
                  <span className="welcome-chips">{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
                  <span>{what}</span>
                </div>
              ))}
            </section>
          </div>
          {err && <div className="welcome-err">{err}</div>}
        </div>
      </div>
      {picker && <Picker source={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}
