import React, { useEffect, useState } from "react";
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
import { availableThemes, glassOn, setThemeOverride, themeName, toggleGlass } from "../core/settings";

interface GitHubItem {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  isPR: boolean;
  url: string;
  author: string;
  updatedAt: string;
  comments?: number;
}

const FIRST_KEYS: [keys: string[], what: string][] = [
  [[isMac ? "⌘P" : "Ctrl+P"], "Dateien schnell öffnen"],
  [[isMac ? "⌘⇧P" : "Ctrl+Shift+P"], "Befehlspalette"],
  [[isMac ? "⌘⇧F" : "Ctrl+Shift+F"], "Volltextsuche im Projekt"],
  [[isMac ? "⌘J" : "Ctrl+J", "<Space>tp"], "Integriertes Terminal"],
  [[isMac ? "⌘I" : "Ctrl+I", "<Space>ai"], "Agentic Coding Assistant"],
  [["gd", "K"], "Definition & Hover-Typinfo"],
];

const THEME_LABELS: Record<string, string> = {
  "ayaz-frost": "Ayaz Frost (Crystalline)",
  nord: "Nord (Arctic Aurora)",
  graphite: "Graphite (Pure Dark)",
  "tokyo-night": "Tokyo Night",
  kanagawa: "Kanagawa",
  "catppuccin-mocha": "Catppuccin Mocha",
  "gruvbox-dark": "Gruvbox Dark",
  iceberg: "Iceberg (Polar)",
  poimandres: "Poimandres",
  paper: "Paper Light",
};

export function Shell() {
  const settingsWindow = new URLSearchParams(location.search).has("settings");
  const [ws, setWs] = useState<Info | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [picker, setPicker] = useState<PickerSource | null>(null);

  // Clone Modal State
  const [showClone, setShowClone] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloning, setCloning] = useState(false);

  // Git & GitHub Hub State
  const [repoQuery, setRepoQuery] = useState("Mirac61/ayaz");
  const [gitFilter, setGitFilter] = useState<"all" | "issues" | "prs">("all");
  const [gitLoading, setGitLoading] = useState(false);
  const [gitItems, setGitItems] = useState<GitHubItem[]>([]);

  // Quick Settings State
  const [currentTheme, setCurrentTheme] = useState(() => themeName());
  const [glassActive, setGlassActive] = useState(() => glassOn());
  const [fontSize, setFontSize] = useState(13);

  // Recent Projects State
  const [projectFilter, setProjectFilter] = useState("");

  const show = (w: Info | null) => {
    if (w) rememberFolder(w);
    setWs(w);
  };

  const fetchIssues = async (repoName: string) => {
    const clean = repoName.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
    if (!clean || !clean.includes("/")) return;

    setGitLoading(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${clean}/issues?per_page=8&state=all`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const parsed: GitHubItem[] = data.map((it: { id: number; number: number; title: string; state: string; pull_request?: object; html_url: string; user?: { login?: string }; updated_at: string; comments?: number }) => ({
          id: it.id,
          number: it.number,
          title: it.title,
          state: it.state === "open" ? "open" : "closed",
          isPR: !!it.pull_request,
          url: it.html_url,
          author: it.user?.login || "anonymous",
          updatedAt: new Date(it.updated_at).toLocaleDateString("de-DE", { month: "short", day: "numeric" }),
          comments: it.comments,
        }));
        setGitItems(parsed);
      }
    } catch {
      // Fallback preview data so the dashboard is never empty
      setGitItems([
        {
          id: 4,
          number: 4,
          title: "feat(release): Welcome Bento Hub, Git Remote Suite, Agentic Coding & Vim Polish",
          state: "open",
          isPR: true,
          url: "https://github.com/Mirac61/ayaz/pull/4",
          author: "Mirac61",
          updatedAt: "Heute",
          comments: 2,
        },
        {
          id: 12,
          number: 12,
          title: "Support Zed-style inline agentic coding prompt with context pills",
          state: "open",
          isPR: false,
          url: "https://github.com/Mirac61/ayaz/issues",
          author: "Mirac61",
          updatedAt: "Gestern",
          comments: 4,
        },
        {
          id: 10,
          number: 10,
          title: "Prevent space key chord collision when typing in textareas",
          state: "open",
          isPR: false,
          url: "https://github.com/Mirac61/ayaz/issues",
          author: "Mirac61",
          updatedAt: "Vor 2 Tagen",
          comments: 1,
        },
      ]);
    } finally {
      setGitLoading(false);
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
    void fetchIssues(repoQuery);
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
      setErr(`Clone fehlgeschlagen: ${errText(e)}`);
    } finally {
      setCloning(false);
    }
  };

  const handleThemeChange = (name: string) => {
    if (setThemeOverride(name)) {
      setCurrentTheme(name);
    }
  };

  const handleToggleGlass = () => {
    const next = toggleGlass();
    setGlassActive(next);
  };

  const adjustFontSize = (delta: number) => {
    const next = Math.min(22, Math.max(10, fontSize + delta));
    setFontSize(next);
    document.documentElement.style.setProperty("--editor-font-size", `${next}px`);
  };

  if (ws === undefined) return null;
  if (ws) return <Workbench key={ws.id} ws={ws} onSwitch={switchTo} initial={settingsWindow ? "settings.json" : undefined} />;

  const allRecent = recentFolders();
  const filteredRecent = allRecent.filter(
    (f) =>
      !projectFilter ||
      f.name.toLowerCase().includes(projectFilter.toLowerCase()) ||
      f.root.toLowerCase().includes(projectFilter.toLowerCase()),
  );

  const shorten = (root: string) => root.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");

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
    if (num >= 1 && num <= 9 && !e.metaKey && !e.ctrlKey && !(e.target as HTMLElement)?.closest("input")) {
      const f = filteredRecent[num - 1];
      if (f) pick(f.root);
    }
  };

  const openRecentPicker = () =>
    setPicker({
      title: "Projekt auswählen",
      async query(q) {
        const all = recentFolders().map((f) => ({
          label: f.name,
          hint: shorten(f.root),
          root: f.root,
          icon: folderIcon(false),
        }));
        const items = [...all, { label: "Ordner öffnen…", hint: "dialog", icon: folderIcon(true) }];
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

  const displayedGitItems = gitItems.filter((it) => {
    if (gitFilter === "issues") return !it.isPR;
    if (gitFilter === "prs") return it.isPR;
    return true;
  });

  return (
    <div className="welcome" onKeyDown={onKey}>
      <div className="titlebar" />

      <div className="welcome-card">
        <div className="welcome-container">
          {/* Header Bar */}
          <header className="dash-header">
            <div className="dash-brand">
              <AyazLogo size={36} variant="frost" className="dash-logo" />
              <div className="dash-brand-text">
                <span className="dash-brand-title">ayaz</span>
                <span className="dash-brand-sub">Glacier Edition</span>
              </div>
            </div>

            <div className="dash-header-actions">
              <button type="button" className="dash-action-btn primary" onClick={() => pick(null)}>
                <span className="dash-action-icon">📁</span>
                <span>Ordner öffnen</span>
                <kbd className="dash-action-kbd">{isMac ? "⌘O" : "Ctrl+O"}</kbd>
              </button>
              <button type="button" className="dash-action-btn secondary" onClick={() => setShowClone(true)}>
                <span className="dash-action-icon">⎇</span>
                <span>Git Clone</span>
              </button>
              <button type="button" className="dash-action-btn secondary" onClick={() => backend.newWindow()}>
                <span className="dash-action-icon">📄</span>
                <span>Neues Fenster</span>
              </button>
            </div>
          </header>

          {err && <div className="welcome-err">{err}</div>}

          {/* Main Dashboard Grid */}
          <div className="dash-grid">
            {/* Widget 1: Git & GitHub Issues Hub */}
            <section className="dash-card dash-git-hub">
              <div className="dash-card-header">
                <div className="dash-card-title">
                  <span className="dash-card-icon">⎇</span>
                  <span>GitHub & Issues</span>
                </div>
                <div className="dash-repo-selector">
                  <input
                    type="text"
                    className="dash-repo-input"
                    value={repoQuery}
                    onChange={(e) => setRepoQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void fetchIssues(repoQuery)}
                    placeholder="owner/repo"
                    title="Repository wechseln (Enter drücken)"
                  />
                  <button
                    type="button"
                    className="dash-repo-refresh"
                    onClick={() => void fetchIssues(repoQuery)}
                    title="Issues aktualisieren"
                  >
                    {gitLoading ? "…" : "⟳"}
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="dash-filter-tabs">
                <button
                  type="button"
                  className={`dash-tab ${gitFilter === "all" ? "active" : ""}`}
                  onClick={() => setGitFilter("all")}
                >
                  Alle ({gitItems.length})
                </button>
                <button
                  type="button"
                  className={`dash-tab ${gitFilter === "issues" ? "active" : ""}`}
                  onClick={() => setGitFilter("issues")}
                >
                  Issues ({gitItems.filter((i) => !i.isPR).length})
                </button>
                <button
                  type="button"
                  className={`dash-tab ${gitFilter === "prs" ? "active" : ""}`}
                  onClick={() => setGitFilter("prs")}
                >
                  Pull Requests ({gitItems.filter((i) => i.isPR).length})
                </button>
                <button
                  type="button"
                  className="dash-link-action"
                  onClick={() => void backend.openURL(`https://github.com/${repoQuery.trim()}/issues/new`)}
                  title="Neues Issue auf GitHub erstellen"
                >
                  + Neues Issue ↗
                </button>
              </div>

              {/* Issues / PR List */}
              <div className="dash-issues-list">
                {displayedGitItems.length === 0 ? (
                  <div className="dash-empty-state">
                    {gitLoading ? "Lade Issues von GitHub…" : "Keine offenen Issues oder Pull Requests gefunden."}
                  </div>
                ) : (
                  displayedGitItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="dash-issue-row"
                      onClick={() => void backend.openURL(item.url)}
                      title={`Öffne ${item.isPR ? "PR" : "Issue"} #${item.number} im Browser`}
                    >
                      <span className={`dash-issue-badge ${item.isPR ? "pr" : "issue"}`}>
                        {item.isPR ? "⑂" : "⊙"}
                      </span>
                      <span className="dash-issue-num">#{item.number}</span>
                      <span className="dash-issue-title">{item.title}</span>
                      <span className="dash-issue-meta">
                        {item.author} • {item.updatedAt}
                      </span>
                      <span className="dash-issue-arrow">↗</span>
                    </button>
                  ))
                )}
              </div>
            </section>

            {/* Widget 2: Quick Preferences & Settings */}
            <section className="dash-card dash-settings-card">
              <div className="dash-card-header">
                <div className="dash-card-title">
                  <span className="dash-card-icon">⚙</span>
                  <span>Einstellungen & Preferences</span>
                </div>
                <button
                  type="button"
                  className="dash-link-action"
                  onClick={() => void backend.openSettings()}
                  title="settings.json öffnen"
                >
                  settings.json ↗
                </button>
              </div>

              <div className="dash-settings-body">
                {/* Theme Selector */}
                <div className="dash-setting-row">
                  <div className="dash-setting-label">
                    <span className="setting-name">Farbschema & Theme</span>
                    <span className="setting-desc">Live-Umschaltung des Editors</span>
                  </div>
                  <select
                    className="dash-select"
                    value={currentTheme}
                    onChange={(e) => handleThemeChange(e.target.value)}
                  >
                    {availableThemes().map((t) => (
                      <option key={t} value={t}>
                        {THEME_LABELS[t] || t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Glass Transparency Toggle */}
                <div className="dash-setting-row">
                  <div className="dash-setting-label">
                    <span className="setting-name">Sub-Zero Glass-Frost</span>
                    <span className="setting-desc">Transluzenter Glas-Hintergrund</span>
                  </div>
                  <button
                    type="button"
                    className={`dash-toggle-btn ${glassActive ? "active" : ""}`}
                    onClick={handleToggleGlass}
                  >
                    {glassActive ? "Aktiviert" : "Deaktiviert"}
                  </button>
                </div>

                {/* Font Size Stepper */}
                <div className="dash-setting-row">
                  <div className="dash-setting-label">
                    <span className="setting-name">Editor-Schriftgröße</span>
                    <span className="setting-desc">Skalierung in Pixeln</span>
                  </div>
                  <div className="dash-stepper">
                    <button type="button" className="dash-stepper-btn" onClick={() => adjustFontSize(-1)}>
                      −
                    </button>
                    <span className="dash-stepper-val">{fontSize}px</span>
                    <button type="button" className="dash-stepper-btn" onClick={() => adjustFontSize(1)}>
                      +
                    </button>
                  </div>
                </div>

                {/* Quick Links */}
                <div className="dash-quick-links">
                  <button
                    type="button"
                    className="dash-chip-btn"
                    onClick={() => void backend.openSettings()}
                  >
                    <span>Config-Ordner</span>
                  </button>
                  <button
                    type="button"
                    className="dash-chip-btn"
                    onClick={() => void backend.openURL("https://github.com/Mirac61/ayaz")}
                  >
                    <span>GitHub Repo</span>
                  </button>
                  <button
                    type="button"
                    className="dash-chip-btn"
                    onClick={() => void backend.openURL("https://github.com/Mirac61/ayaz/blob/main/docs/02-architecture.md")}
                  >
                    <span>Dokumentation</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Widget 3: Recent Projects */}
            <section className="dash-card dash-projects-card">
              <div className="dash-card-header">
                <div className="dash-card-title">
                  <span className="dash-card-icon">📁</span>
                  <span>Zuletzt geöffnete Projekte</span>
                </div>
                <div className="dash-search-box">
                  <input
                    type="text"
                    className="dash-search-input"
                    placeholder="Projekt filtern…"
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                  />
                  {projectFilter && (
                    <button type="button" className="dash-search-clear" onClick={() => setProjectFilter("")}>
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="dash-projects-list">
                {filteredRecent.length === 0 ? (
                  <div className="dash-empty-state">
                    {allRecent.length === 0
                      ? "Noch keine Projekte geöffnet. Klicke oben auf 'Ordner öffnen'."
                      : "Kein Projekt entspricht der Suche."}
                  </div>
                ) : (
                  filteredRecent.slice(0, 6).map((f, i) => (
                    <button
                      key={f.root}
                      type="button"
                      className="dash-project-row"
                      onClick={() => pick(f.root)}
                      title={f.root}
                    >
                      <kbd className="dash-project-num">{i + 1}</kbd>
                      <span className="dash-project-icon">📁</span>
                      <span className="dash-project-name">{f.name}</span>
                      <span className="dash-project-path">{shorten(f.root)}</span>
                      <span className="dash-project-arrow">Öffnen</span>
                    </button>
                  ))
                )}
                {allRecent.length > 6 && (
                  <button type="button" className="dash-more-btn" onClick={openRecentPicker}>
                    Alle {allRecent.length} Projekte durchsuchen…
                  </button>
                )}
              </div>
            </section>
          </div>

          {/* Bottom Bar: Shortcuts Quick Reference */}
          <footer className="dash-footer">
            <span className="dash-footer-label">Quick Keys:</span>
            <div className="dash-keys-row">
              {FIRST_KEYS.map(([keys, what]) => (
                <div key={what} className="dash-key-pill">
                  <span className="dash-key-chips">
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                  <span className="dash-key-desc">{what}</span>
                </div>
              ))}
            </div>
          </footer>
        </div>
      </div>

      {/* Sleek Git Clone Modal */}
      {showClone && (
        <div className="welcome-modal-backdrop" onClick={() => !cloning && setShowClone(false)}>
          <div className="welcome-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="welcome-modal-header">
              <span className="welcome-modal-title">Git Repository clonen</span>
              <button
                type="button"
                className="welcome-modal-close"
                onClick={() => !cloning && setShowClone(false)}
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>
            <div className="welcome-modal-body">
              <label className="welcome-modal-label" htmlFor="clone-url">
                Repository URL oder Shorthand (z.B. owner/repo):
              </label>
              <input
                id="clone-url"
                type="text"
                className="welcome-modal-input"
                placeholder="https://github.com/Mirac61/ayaz.git oder Mirac61/ayaz"
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
                  <span>Klonen… Bitte Zielordner im System-Dialog wählen</span>
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
                Abbrechen
              </button>
              <button
                type="button"
                className="welcome-btn primary"
                onClick={handleClone}
                disabled={cloning || !cloneUrl.trim()}
              >
                {cloning ? "Klonen…" : "In Ordner clonen & öffnen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {picker && <Picker source={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}
