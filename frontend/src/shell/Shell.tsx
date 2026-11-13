import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { DOCS_INDEX, docFiles } from "../docs/docsData";
import { availableThemes, setThemeOverride, themeName } from "../core/settings";

interface GitHubItem {
  id: number;
  number: number;
  title: string;
  isPR: boolean;
  url: string;
  updatedAt: string;
}

// The keys to know first, from the default keymap (the user's keymap.json is read later).
const keysOf = (...ids: string[]) => defaultKeymap().filter((b) => ids.includes(b.command)).map((b) => b.keys);
const FIRST_KEYS: [keys: string[], what: string][] = [
  [keysOf("find.files"), "Find files"],
  [keysOf("find.grep"), "Search in files"],
  [keysOf("find.commands"), "All commands and their keys"],
  [keysOf("term.panel"), "Terminal"],
  [["gd", "gr", "K"], "Definition, references, hover"],
  [[":w", ":q"], "Save, close"],
];

const mod = (k: string) => (isMac ? `⌘${k}` : `Ctrl+${k}`);
const shorten = (root: string) => root.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");

// Opens the folder from the command line (first window only), otherwise shows the start page.
export function Shell() {
  const settingsWindow = new URLSearchParams(location.search).has("settings");
  const [ws, setWs] = useState<Info | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [picker, setPicker] = useState<PickerSource | null>(null);
  const [theme, setTheme] = useState(() => themeName());
  // Stable, so it focuses once on mount and the single-key actions work without a click first.
  const page = useRef<HTMLDivElement | null>(null);
  const focusPage = () => page.current?.focus({ preventScroll: true });
  const focusOnMount = useCallback((el: HTMLDivElement | null) => {
    page.current = el;
    el?.focus({ preventScroll: true });
  }, []);

  const [showClone, setShowClone] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloning, setCloning] = useState(false);
  const [initial, setInitial] = useState<string | undefined>(); // a file the next workbench opens first

  const [repo, setRepo] = useState("Mirac61/ayaz");
  const [issues, setIssues] = useState<GitHubItem[] | "loading" | "failed">("loading");
  const issuesReqId = useRef(0);

  const show = (w: Info | null) => {
    if (w) rememberFolder(w);
    setInitial(undefined);
    setWs(w);
  };

  // The docs need a workbench, and a workbench a folder: the docs written out to <config>/docs, kept out of Recent.
  const openDocs = () =>
    backend.docsFolder(docFiles()).then(backend.openFolder).then((w) => {
      setInitial(DOCS_INDEX);
      setWs(w);
    }, (e) => setErr(errText(e)));

  const fetchIssues = async (name: string) => {
    const clean = name.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
    if (!clean.includes("/")) return;
    const reqId = ++issuesReqId.current;
    setIssues("loading");
    try {
      const res = await fetch(`https://api.github.com/repos/${clean}/issues?per_page=6&state=open`);
      if (issuesReqId.current !== reqId) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { id: number; number: number; title: string; pull_request?: object; html_url: string; updated_at: string }[] =
        await res.json();
      if (issuesReqId.current !== reqId) return;
      setIssues(
        data.map((it) => ({
          id: it.id,
          number: it.number,
          title: it.title,
          isPR: !!it.pull_request,
          url: it.html_url,
          updatedAt: new Date(it.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        })),
      );
    } catch {
      if (issuesReqId.current === reqId) setIssues("failed");
    }
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

  useEffect(() => {
    void fetchIssues(repo);
  }, []);

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

  const closeClone = () => {
    setShowClone(false);
    focusPage();
  };

  const handleClone = async () => {
    if (cloning) return;
    const trimmed = cloneUrl.trim();
    if (!trimmed) return;
    const url = trimmed.includes("://") || trimmed.startsWith("git@") ? trimmed : `https://github.com/${trimmed}.git`;
    setCloning(true);
    try {
      const res = await backend.clone(url);
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
  if (ws) return <Workbench key={ws.id} ws={ws} onSwitch={switchTo} initial={settingsWindow ? "settings.json" : initial} />;

  const recent = recentFolders();

  const openRecentPicker = () =>
    setPicker({
      title: "Recent folders",
      placeholder: "Filter folders",
      async query(q) {
        const ql = q.toLowerCase();
        return recent
          .map((f) => ({ label: f.name, hint: shorten(f.root), icon: folderIcon(false) }))
          .filter((it) => !q || it.label.toLowerCase().includes(ql) || it.hint.toLowerCase().includes(ql));
      },
      pick: (it) => void pick(recent.find((f) => shorten(f.root) === it.hint)?.root ?? null),
    });

  const openThemePicker = () =>
    setPicker({
      title: "Theme",
      start: Math.max(0, availableThemes().indexOf(theme)),
      async query(q) {
        return availableThemes()
          .filter((t) => t.includes(q.toLowerCase()))
          .map((t) => ({ label: t, hint: t === theme ? "current" : "" }));
      },
      pick: (it) => {
        if (setThemeOverride(it.label)) setTheme(it.label);
      },
    });

  // Single keys like a Neovim dashboard; they only act when no field has focus.
  const tiles: { key: string; icon: string; label: string; sub: string; run: () => void }[] = [
    { key: "o", icon: "", label: "Open folder", sub: mod("O"), run: () => void pick(null) },
    { key: "c", icon: "", label: "Clone repository", sub: "Git URL or owner/repo", run: () => setShowClone(true) },
    { key: "n", icon: "", label: "New window", sub: mod(isMac ? "⇧N" : "Shift+N"), run: () => void backend.newWindow() },
    { key: "t", icon: "", label: "Theme", sub: theme, run: openThemePicker },
    { key: "?", icon: "", label: "Docs & Help", sub: "<F1> or :help", run: () => void openDocs() },
  ];
  const singleKeys: Record<string, () => void> = {
    r: openRecentPicker,
    ",": () => void backend.openSettings(),
    ...Object.fromEntries(tiles.map((t) => [t.key, t.run])),
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (picker || showClone) return;
    const cmd = isMac ? e.metaKey : e.ctrlKey;
    if (cmd && e.key === ",") return void backend.openSettings();
    if (cmd && e.key === "o") {
      e.preventDefault();
      return void pick(null);
    }
    if (cmd && e.shiftKey && e.key.toLowerCase() === "n") {
      e.preventDefault();
      return void backend.newWindow();
    }
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input")) return;
    const num = Number(e.key);
    if (num >= 1 && num <= 9 && recent[num - 1]) return void pick(recent[num - 1].root);
    const run = singleKeys[e.key];
    if (run) {
      e.preventDefault();
      run();
    }
  };

  const issueList = Array.isArray(issues) ? issues : [];

  return (
    <div className="welcome" onKeyDown={onKey} tabIndex={-1} ref={focusOnMount}>
      <div className="welcome-sky" aria-hidden="true" />
      <div className="titlebar" />

      <div className="welcome-scroll">
        <div className="welcome-page">
          <header className="welcome-hero">
            <AyazLogo size={88} variant="frost" className="welcome-crystal" />
            <h1 className="welcome-title">ayaz</h1>
            <p className="welcome-tagline">Clear as a frosty night. Neovim at heart, with a real terminal, Markdown and PDFs.</p>
          </header>

          <button type="button" className="welcome-launch" onClick={openRecentPicker}>
            <span className="welcome-glyph" aria-hidden="true">
              {""}
            </span>
            <span className="welcome-launch-text">Jump to a recent folder…</span>
            <kbd aria-hidden="true">r</kbd>
          </button>

          {err && <div className="welcome-err">{err}</div>}

          <section className="welcome-tiles" aria-label="Start">
            {tiles.map((t) => (
              <button key={t.key} type="button" className="welcome-tile" onClick={t.run}>
                <span className="welcome-tile-icon welcome-glyph" aria-hidden="true">
                  {t.icon}
                </span>
                <span className="welcome-tile-label">{t.label}</span>
                <span className="welcome-tile-sub">{t.sub}</span>
                <kbd className="welcome-tile-key" aria-hidden="true">
                  {t.key}
                </kbd>
              </button>
            ))}
          </section>

          <div className="welcome-panels">
            <nav className="welcome-panel" aria-label="Recent folders">
              <h2 className="welcome-panel-head">
                <span>Recent</span>
                {recent.length > 9 && <span className="welcome-panel-meta">{recent.length} folders</span>}
              </h2>
              {recent.length === 0 ? (
                <p className="welcome-empty">Nothing here yet. Press o to open a folder.</p>
              ) : (
                recent.slice(0, 7).map((f, i) => (
                  <button key={f.root} type="button" className="welcome-row" onClick={() => void pick(f.root)} title={f.root}>
                    <span className="welcome-avatar" aria-hidden="true">
                      {f.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="welcome-row-text">
                      <span className="welcome-row-main">{f.name}</span>
                      <span className="welcome-row-path">{shorten(f.root)}</span>
                    </span>
                    <kbd className="welcome-row-key" aria-hidden="true">
                      {i + 1}
                    </kbd>
                  </button>
                ))
              )}
            </nav>

            <section className="welcome-panel" aria-label="Issues">
              <h2 className="welcome-panel-head">
                <span>Open issues</span>
                <input
                  className="welcome-repo"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void fetchIssues(repo)}
                  aria-label="GitHub repository (owner/repo), Enter to load"
                  spellCheck={false}
                />
              </h2>
              {issues === "loading" && <p className="welcome-empty">Loading…</p>}
              {issues === "failed" && <p className="welcome-empty">Couldn't reach GitHub. Press Enter in the field to retry.</p>}
              {Array.isArray(issues) && issueList.length === 0 && <p className="welcome-empty">Nothing open. Enjoy the quiet.</p>}
              {issueList.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="welcome-row"
                  onClick={() => void backend.openURL(it.url)}
                  title={`Open ${it.isPR ? "pull request" : "issue"} #${it.number} in the browser`}
                >
                  <span className={`welcome-glyph welcome-issue-icon ${it.isPR ? "pr" : ""}`} aria-hidden="true">
                    {it.isPR ? "" : ""}
                  </span>
                  <span className="welcome-row-text">
                    <span className="welcome-row-main">{it.title}</span>
                    <span className="welcome-row-path">
                      #{it.number} · {it.updatedAt}
                    </span>
                  </span>
                </button>
              ))}
            </section>
          </div>

          <footer className="welcome-keys" aria-label="Keys" role="region">
            {FIRST_KEYS.map(([keys, what]) => (
              <span key={what} className="welcome-key">
                <kbd>{keys[0]}</kbd>
                <span>{what}</span>
              </span>
            ))}
            <button type="button" className="welcome-key welcome-settings" onClick={() => void backend.openSettings()}>
              <kbd>{mod(",")}</kbd>
              <span>Settings</span>
            </button>
          </footer>
        </div>
      </div>

      {showClone && (
        <div className="welcome-modal-backdrop" onClick={() => !cloning && closeClone()}>
          <div className="welcome-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="welcome-modal-header">
              <span className="welcome-modal-title">Clone repository</span>
              <button
                type="button"
                className="welcome-modal-close"
                onClick={() => !cloning && closeClone()}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="welcome-modal-body">
              <label className="welcome-modal-label" htmlFor="clone-url">
                URL or owner/repo
              </label>
              <input
                id="clone-url"
                type="text"
                className="welcome-modal-input"
                placeholder="Mirac61/ayaz"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !cloning) void handleClone();
                  if (e.key === "Escape" && !cloning) closeClone();
                }}
                autoFocus
                spellCheck={false}
              />
              {cloning && (
                <div className="welcome-modal-loading">
                  <span className="welcome-spinner" />
                  <span>Cloning… choose the target folder in the dialog</span>
                </div>
              )}
            </div>
            <div className="welcome-modal-footer">
              <button type="button" className="welcome-btn secondary" onClick={closeClone} disabled={cloning}>
                Cancel
              </button>
              <button type="button" className="welcome-btn primary" onClick={handleClone} disabled={cloning || !cloneUrl.trim()}>
                {cloning ? "Cloning…" : "Clone and open"}
              </button>
            </div>
          </div>
        </div>
      )}

      {picker && (
        <Picker
          source={picker}
          onClose={() => {
            setPicker(null);
            focusPage();
          }}
        />
      )}
    </div>
  );
}
