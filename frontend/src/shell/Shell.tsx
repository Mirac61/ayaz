import { useEffect, useState } from "react";
import { backend, type Info } from "../core/backend";
import { isMac } from "../core/keymap";
import { closeLsp } from "../editor/lsp";
import { errText } from "./commands/context";
import { rememberFolder, recentFolders } from "./folders";
import { Picker, type PickerSource } from "./Picker";
import { folderIcon } from "../theme/icons";
import { setZoom, zoomLevel } from "./zoom";
import { Workbench } from "./Workbench";
import { AyazLogo } from "./AyazLogo";

const FIRST_KEYS: [keys: string[], what: string][] = [
  [[isMac ? "⌘P" : "Ctrl+P"], "Quick open files"],
  [[isMac ? "⌘⇧P" : "Ctrl+Shift+P"], "Command palette"],
  [[isMac ? "⌘⇧F" : "Ctrl+Shift+F"], "Search in files"],
  [[isMac ? "⌘B" : "Ctrl+B"], "Toggle sidebar"],
  [[isMac ? "⌘J" : "Ctrl+J", "<Space>tp"], "Terminal"],
  [["gd", "K"], "Definition, hover doc"],
  [[":w", ":q"], "Save, close"],
];

export function Shell() {
  const settingsWindow = new URLSearchParams(location.search).has("settings");
  const [ws, setWs] = useState<Info | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [picker, setPicker] = useState<PickerSource | null>(null);
  const [showClone, setShowClone] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloning, setCloning] = useState(false);

  const show = (w: Info | null) => {
    if (w) rememberFolder(w);
    setWs(w);
  };

  useEffect(() => {
    if (zoomLevel() !== 1) void setZoom(zoomLevel()).catch(() => {});
    if (new URLSearchParams(location.search).has("new")) return setWs(null);
    const failed = (e: unknown) => {
      setErr(errText(e));
      setWs(null);
    };
    if (settingsWindow) return void backend.configFolder().then(backend.openFolder).then(setWs, failed);
    backend.initialWorkspace().then(show, failed);
  }, [settingsWindow]);

  const open = (root: string | null) => (root ? backend.openFolder(root) : backend.openFolderDialog());
  const pick = (root: string | null) => open(root).then((w) => w && show(w), (e) => setErr(errText(e)));

  const switchTo = (root: string | null) => {
    const old = ws;
    open(root).then(
      (w) => {
        if (!w || !old) return;
        show(w);
        closeLsp(old.id);
        void backend.closeWorkspace(old.id);
      },
      (e) => setErr(errText(e)),
    );
  };

  const handleClone = async () => {
    const trimmed = cloneUrl.trim();
    if (!trimmed) return;
    const repo = trimmed.includes("://") ? trimmed : `https://github.com/${trimmed}.git`;
    setCloning(true);
    try {
      const res = await backend.clone(repo);
      if (res) {
        setShowClone(false);
        setCloneUrl("");
        show(res);
      }
    } catch (e) {
      setErr(`Clone failed: ${errText(e)}`);
    } finally {
      setCloning(false);
    }
  };

  if (ws === undefined) return null;
  if (ws) return <Workbench key={ws.id} ws={ws} onSwitch={switchTo} initial={settingsWindow ? "settings.json" : undefined} />;

  const recent = recentFolders().slice(0, 8);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "," && (isMac ? e.metaKey : e.ctrlKey)) return void backend.openSettings();
    if (e.key === "o" && (isMac ? e.metaKey : e.ctrlKey)) {
      e.preventDefault();
      return void pick(null);
    }
    if (e.key === "n" && (isMac ? e.metaKey : e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      return void backend.newWindow();
    }
    const num = Number(e.key);
    if (num >= 1 && num <= 9 && !e.metaKey && !e.ctrlKey) {
      const f = recent[num - 1];
      if (f) pick(f.root);
    }
  };

  const shorten = (root: string) => root.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");

  const openRecentPicker = () =>
    setPicker({
      title: "Switch folder",
      async query(q) {
        const all = recentFolders().map((f) => ({
          label: f.name,
          hint: shorten(f.root),
          root: f.root,
          icon: folderIcon(false),
        }));
        const items = [...all, { label: "Open folder…", hint: "dialog", icon: folderIcon(true) }];
        return items.filter(
          (it) =>
            !q ||
            it.label.toLowerCase().includes(q.toLowerCase()) ||
            ((it as { root?: string }).root && (it as { root?: string }).root!.toLowerCase().includes(q.toLowerCase())) ||
            (it.hint && it.hint.toLowerCase().includes(q.toLowerCase())),
        );
      },
      pick: (it) => void pick((it as { root?: string }).root ?? (it.hint === "dialog" ? null : it.label)),
    });

  return (
    <div className="welcome" onKeyDown={onKey}>
      <div className="titlebar" />

      <div className="welcome-card">
        <div className="welcome-list">
          <header className="welcome-brand">
            <AyazLogo size={48} variant="frost" className="welcome-logo" />
            <div className="welcome-brand-text">
              <h1 className="welcome-title">ayaz</h1>
              <p className="welcome-sub">A keyboard-first code editor</p>
            </div>
          </header>

          <div className="welcome-cols">
            <div className="welcome-col">
              <nav aria-label="Start">
                <div className="welcome-label">Start</div>
                <button
                  type="button"
                  className="welcome-action-row primary"
                  autoFocus={!recent.length}
                  onClick={() => pick(null)}
                >
                  <span className="welcome-row-title">Open folder…</span>
                  <span className="welcome-row-hint">{isMac ? "⌘O" : "Ctrl+O"}</span>
                </button>
                <button
                  type="button"
                  className="welcome-action-row"
                  onClick={() => setShowClone(true)}
                >
                  <span className="welcome-row-title">Clone repository…</span>
                  <span className="welcome-row-hint">Git</span>
                </button>
                <button
                  type="button"
                  className="welcome-action-row"
                  onClick={() => backend.newWindow()}
                >
                  <span className="welcome-row-title">New window</span>
                  <span className="welcome-row-hint">{isMac ? "⌘⇧N" : "Ctrl+Shift+N"}</span>
                </button>
              </nav>

              {recent.length > 0 && (
                <nav aria-label="Recent folders">
                  <div className="welcome-label">Recent</div>
                  {recent.map((f, i) => (
                    <button
                      key={f.root}
                      type="button"
                      className="welcome-action-row"
                      onClick={() => pick(f.root)}
                      title={f.root}
                      autoFocus={i === 0}
                    >
                      <kbd className="welcome-num">{i + 1}</kbd>
                      <span className="welcome-name">{f.name}</span>
                      <span className="welcome-path">{shorten(f.root)}</span>
                    </button>
                  ))}
                  {recentFolders().length > recent.length && (
                    <button
                      type="button"
                      className="welcome-action-row more"
                      onClick={openRecentPicker}
                    >
                      <span className="welcome-row-title">More recent projects…</span>
                    </button>
                  )}
                </nav>
              )}
            </div>

            <section className="welcome-keys" aria-label="Keys">
              <div className="welcome-label">Keys</div>
              {FIRST_KEYS.map(([keys, what]) => (
                <div key={what} className="welcome-key">
                  <span className="welcome-chips">
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                  <span className="welcome-key-desc">{what}</span>
                </div>
              ))}
            </section>
          </div>

          <footer className="welcome-footer">
            <button
              type="button"
              className="welcome-footer-link"
              onClick={() => void backend.openURL("https://github.com/Mirac61/ayaz")}
            >
              GitHub
            </button>
            <span className="welcome-footer-sep">•</span>
            <button
              type="button"
              className="welcome-footer-link"
              onClick={() => void backend.openURL("https://github.com/Mirac61/ayaz/issues")}
            >
              Issues
            </button>
            <span className="welcome-footer-sep">•</span>
            <button
              type="button"
              className="welcome-footer-link"
              onClick={() => void backend.openSettings()}
            >
              Settings ({isMac ? "⌘," : "Ctrl+,"})
            </button>
          </footer>

          {err && <div className="welcome-err">{err}</div>}
        </div>
      </div>

      {showClone && (
        <div className="welcome-modal-backdrop" onClick={() => !cloning && setShowClone(false)}>
          <div className="welcome-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="welcome-modal-header">
              <span className="welcome-modal-title">Clone Repository</span>
              <button
                type="button"
                className="welcome-modal-close"
                onClick={() => !cloning && setShowClone(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="welcome-modal-body">
              <label className="welcome-modal-label" htmlFor="clone-url">
                Repository URL or owner/repo shorthand:
              </label>
              <input
                id="clone-url"
                type="text"
                className="welcome-modal-input"
                placeholder="https://github.com/Mirac61/ayaz.git or Mirac61/ayaz"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleClone();
                  if (e.key === "Escape" && !cloning) setShowClone(false);
                }}
                autoFocus
                spellCheck={false}
              />
              {cloning && (
                <div className="welcome-modal-loading">
                  <span className="welcome-spinner" />
                  <span>Cloning repository… please select target folder in the dialog</span>
                </div>
              )}
            </div>
            <div className="welcome-modal-footer">
              <button
                type="button"
                className="welcome-btn secondary"
                onClick={() => setShowClone(false)}
                disabled={cloning}
              >
                Cancel
              </button>
              <button
                type="button"
                className="welcome-btn primary"
                onClick={handleClone}
                disabled={cloning || !cloneUrl.trim()}
              >
                {cloning ? "Cloning…" : "Clone & Open"}
              </button>
            </div>
          </div>
        </div>
      )}

      {picker && <Picker source={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}
