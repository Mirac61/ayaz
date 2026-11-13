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
import { themeName, setThemeOverride } from "../core/settings";

type CheatsheetCategory = "essentials" | "lsp" | "vim" | "splits";

interface ShortcutItem {
  keys: string[];
  label: string;
}

const CHEATSHEET: Record<CheatsheetCategory, { title: string; icon: string; items: ShortcutItem[] }> = {
  essentials: {
    title: "Essentials",
    icon: "★",
    items: [
      { keys: [isMac ? "Cmd+P" : "Ctrl+P"], label: "Dateien im Projekt durchsuchen (Quick Open)" },
      { keys: [isMac ? "Cmd+Shift+P" : "Ctrl+Shift+P"], label: "Befehlspalette mit allen Aktionen" },
      { keys: [isMac ? "Cmd+Shift+F" : "Ctrl+Shift+F"], label: "Projekt-Volltextsuche (Ripgrep)" },
      { keys: [isMac ? "Cmd+B" : "Ctrl+B"], label: "Dateibaum & Seitenleiste umschalten" },
      { keys: [isMac ? "Cmd+," : "Ctrl+,"], label: "Ayaz Einstellungen (settings.json)" },
      { keys: [isMac ? "Cmd+O" : "Ctrl+O"], label: "Ordner auswählen & öffnen" },
    ],
  },
  lsp: {
    title: "Code & LSP",
    icon: "⚡",
    items: [
      { keys: ["gd"], label: "Gehe zur Definition (Go to definition)" },
      { keys: ["K"], label: "Typ-Information & Hover-Dokumentation" },
      { keys: ["gr"], label: "Alle Symbol-Referenzen finden" },
      { keys: ["Space", "r", "n"], label: "Symbol projektweit umbenennen (Rename)" },
      { keys: ["Space", "c", "a"], label: "Code Actions & Quickfix anwenden" },
      { keys: ["Space", "c", "f"], label: "Aktive Datei mit Formatierer formatieren" },
    ],
  },
  vim: {
    title: "Vim Modal",
    icon: "❄",
    items: [
      { keys: ["Esc", "Ctrl+["], label: "Zurück in den Normal-Modus" },
      { keys: ["i", "a"], label: "Einfügen vor / nach dem Cursor" },
      { keys: ["v", "V"], label: "Zeichen- / Zeilenweise Selektion" },
      { keys: [":w"], label: "Puffer auf Festplatte speichern" },
      { keys: [":q"], label: "Aktiven Puffer / Fenster schließen" },
      { keys: ["d", "d"], label: "Ganze Zeile löschen und ausschneiden" },
    ],
  },
  splits: {
    title: "Splits & Terminal",
    icon: "◫",
    items: [
      { keys: ["Ctrl+W", "v"], label: "Editor vertikal teilen (Split Right)" },
      { keys: ["Ctrl+W", "s"], label: "Editor horizontal teilen (Split Down)" },
      { keys: ["Ctrl+W", "h/j/k/l"], label: "Fokus zwischen Split-Panes bewegen" },
      { keys: ["Ctrl+`"], label: "Integriertes Terminal ein- / ausblenden" },
      { keys: [isMac ? "Cmd+Shift+T" : "Ctrl+Shift+T"], label: "Neues Terminal-Tab öffnen" },
    ],
  },
};

const THEME_OPTIONS = [
  { id: "ayaz-frost", name: "Ayaz Frost", accent: "#70d6ff", bg: "#0b0e14", desc: "Sub-Zero Crystalline" },
  { id: "nord", name: "Nord", accent: "#88c0d0", bg: "#2e3440", desc: "Arctic Aurora" },
  { id: "iceberg", name: "Iceberg", accent: "#84a0c6", bg: "#161821", desc: "Polar Dark" },
  { id: "poimandres", name: "Poimandres", accent: "#5de4c7", bg: "#1b1e28", desc: "Cyber Neon" },
  { id: "graphite", name: "Graphite", accent: "#599eff", bg: "#18181b", desc: "Pure Mono" },
  { id: "kanagawa", name: "Kanagawa", accent: "#7e9cd8", bg: "#1f1f28", desc: "Wave & Gold" },
  { id: "tokyo-night", name: "Tokyo Night", accent: "#7aa2f7", bg: "#1a1b26", desc: "Midnight Neon" },
  { id: "catppuccin-mocha", name: "Catppuccin", accent: "#cdd6f4", bg: "#1e1e2e", desc: "Pastel Cocoa" },
  { id: "gruvbox-dark", name: "Gruvbox", accent: "#fabd2f", bg: "#282828", desc: "Warm Retro" },
  { id: "paper", name: "Paper Light", accent: "#3b82f6", bg: "#f8fafc", desc: "Clean Day" },
];

export function Shell() {
  const settingsWindow = new URLSearchParams(location.search).has("settings");
  const [ws, setWs] = useState<Info | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [picker, setPicker] = useState<PickerSource | null>(null);
  const [version, setVersion] = useState("v0.4.0");

  // Welcome Screen Bento states
  const [recentSearch, setRecentSearch] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [githubRepo, setGithubRepo] = useState("Mirac61/ayaz");
  const [cheatsheetTab, setCheatsheetTab] = useState<CheatsheetCategory>("essentials");
  const [activeTheme, setActiveTheme] = useState(() => themeName());
  const [copiedCli, setCopiedCli] = useState(false);
  const [copiedClone, setCopiedClone] = useState(false);

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

    void backend.currentVersion().then((v) => {
      if (v) setVersion(v.startsWith("v") ? v : "v" + v);
    }).catch(() => {});
  }, []);

  const open = (root: string | null) => (root ? backend.openFolder(root) : backend.openFolderDialog());
  const pick = (root: string | null) => open(root).then((w) => w && show(w), (e) => setErr(errText(e)));

  const switchTo = (root: string | null) => {
    const old = ws;
    open(root).then((w) => {
      if (!w || !old) return;
      show(w);
      closeLsp(old.id);
      void backend.closeWorkspace(old.id);
    }, (e) => setErr(errText(e)));
  };

  const handleClone = async () => {
    const target = cloneUrl.trim();
    if (!target) return;
    setCloneLoading(true);
    setErr("");
    try {
      const w = await backend.clone(target);
      if (w) {
        setShowCloneModal(false);
        show(w);
      }
    } catch (e) {
      setErr(errText(e));
    } finally {
      setCloneLoading(false);
    }
  };

  const handleThemeChange = (id: string) => {
    setThemeOverride(id);
    setActiveTheme(id);
  };

  const openScratchpad = () => {
    backend.configFolder().then((folder) => {
      if (folder) void pick(folder);
    }).catch((e) => setErr(errText(e)));
  };

  const copyCliLogin = async () => {
    await backend.copy("gh auth login");
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  const openGitHubIssues = () => {
    const r = githubRepo.trim() || "Mirac61/ayaz";
    const url = r.startsWith("http") ? r : `https://github.com/${r}/issues`;
    void backend.openURL(url);
  };

  const openGitHubPulls = () => {
    const r = githubRepo.trim() || "Mirac61/ayaz";
    const url = r.startsWith("http") ? `${r}/pulls` : `https://github.com/${r}/pulls`;
    void backend.openURL(url);
  };

  if (ws === undefined) return null;
  if (ws) return <Workbench key={ws.id} ws={ws} onSwitch={switchTo} initial={settingsWindow ? "settings.json" : undefined} />;

  const allRecent = recentFolders();
  const filteredRecent = recentSearch.trim()
    ? allRecent.filter(
        (f) =>
          f.name.toLowerCase().includes(recentSearch.toLowerCase()) ||
          f.root.toLowerCase().includes(recentSearch.toLowerCase()),
      ).slice(0, 12)
    : allRecent.slice(0, 9);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "," && (isMac ? e.metaKey : e.ctrlKey)) {
      e.preventDefault();
      return void backend.openSettings();
    }
    if (e.key === "o" && (isMac ? e.metaKey : e.ctrlKey)) {
      e.preventDefault();
      return void pick(null);
    }
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      return;
    }
    if (showCloneModal) {
      if (e.key === "Escape") setShowCloneModal(false);
      return;
    }
    const num = Number(e.key);
    if (num >= 1 && num <= 9 && !e.metaKey && !e.ctrlKey) {
      const f = filteredRecent[num - 1];
      if (f) pick(f.root);
    }
  };

  const openRecentPicker = () => setPicker({
    title: "Switch folder",
    async query(q) {
      const recent = recentFolders().map((f) => {
        const shortened = f.root.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
        return {
          label: f.name,
          hint: shortened,
          root: f.root,
          icon: folderIcon(false),
        };
      });
      const items = [...recent, { label: "Open folder…", hint: "dialog", icon: folderIcon(true) }];
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
      <div className="titlebar">
        <button type="button" className="titlebar-project" tabIndex={-1} onClick={openRecentPicker}>
          <AyazLogo size={12} variant="frost" className="titlebar-project-logo" />
          <span className="titlebar-project-name">Open Recent Project</span>
        </button>
      </div>

      <div className="welcome-card">
        <div className="welcome-list">
          {/* Hero Header */}
          <header className="welcome-hero">
            <div className="welcome-hero-brand">
              <div className="welcome-logo-wrap">
                <AyazLogo size={56} variant="frost" className="welcome-logo" />
              </div>
              <div className="welcome-hero-text">
                <div className="welcome-title-row">
                  <h1 className="welcome-title">ayaz</h1>
                  <span className="welcome-version-badge">{version}</span>
                  <span className="welcome-edition-badge">Glacier Edition</span>
                </div>
                <p className="welcome-sub">
                  Der kristalline, tastatur-zentrierte Code Editor für maximale Entwicklungsgeschwindigkeit.
                </p>
              </div>
            </div>

            <div className="welcome-hero-links">
              <button
                type="button"
                className="welcome-link-btn"
                onClick={() => void backend.openURL("https://github.com/Mirac61/ayaz")}
              >
                <span className="welcome-link-icon">★</span>
                <span>GitHub</span>
              </button>
              <button
                type="button"
                className="welcome-link-btn"
                onClick={() => void backend.openURL("https://github.com/Mirac61/ayaz/issues")}
              >
                <span className="welcome-link-icon">⚡</span>
                <span>Issues</span>
              </button>
              <button
                type="button"
                className="welcome-link-btn"
                onClick={() => void backend.openSettings()}
                title="Einstellungen & Konfiguration (Cmd+,)"
              >
                <span className="welcome-link-icon">⚙</span>
                <span>Config</span>
              </button>
            </div>
          </header>

          {err && <div className="welcome-err">{err}</div>}

          {/* Bento Grid */}
          <div className="welcome-bento">
            {/* Bento 1: Start & Git */}
            <section className="welcome-card-box welcome-start-card" aria-label="Schnellstart & Git">
              <div className="welcome-card-header">
                <span className="welcome-card-tag">START & GIT</span>
                <h2 className="welcome-card-title">Schnellstart</h2>
              </div>

              <div className="welcome-actions">
                <button
                  type="button"
                  className="welcome-action-primary"
                  onClick={() => pick(null)}
                  autoFocus={!allRecent.length}
                >
                  <span className="welcome-action-icon">⊞</span>
                  <div className="welcome-action-info">
                    <span className="welcome-action-name">Ordner öffnen…</span>
                    <span className="welcome-action-hint">{isMac ? "⌘O" : "Ctrl+O"}</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="welcome-action-secondary"
                  onClick={() => setShowCloneModal(true)}
                >
                  <span className="welcome-action-icon">⎇</span>
                  <div className="welcome-action-info">
                    <span className="welcome-action-name">Git Repository clonen…</span>
                    <span className="welcome-action-hint">URL oder owner/repo</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="welcome-action-secondary"
                  onClick={openScratchpad}
                >
                  <span className="welcome-action-icon">✦</span>
                  <div className="welcome-action-info">
                    <span className="welcome-action-name">Konfiguration & Scratchpad</span>
                    <span className="welcome-action-hint">settings.json & Notizen</span>
                  </div>
                </button>
              </div>

              {/* GitHub Hub Subcard */}
              <div className="welcome-github-hub">
                <div className="welcome-subhead">
                  <span className="welcome-subhead-icon"></span>
                  <span>GitHub Integration</span>
                </div>
                <div className="welcome-gh-input-row">
                  <input
                    type="text"
                    className="welcome-gh-input"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="owner/repo (z.B. Mirac61/ayaz)"
                    spellCheck={false}
                  />
                </div>
                <div className="welcome-gh-actions">
                  <button
                    type="button"
                    className="welcome-gh-btn"
                    onClick={openGitHubIssues}
                    title="Issues im Browser ansehen"
                  >
                    <span>Issues ↗</span>
                  </button>
                  <button
                    type="button"
                    className="welcome-gh-btn"
                    onClick={openGitHubPulls}
                    title="Pull Requests im Browser ansehen"
                  >
                    <span>PRs ↗</span>
                  </button>
                </div>

                <div className="welcome-cli-row">
                  <span className="welcome-cli-label">GitHub CLI:</span>
                  <code className="welcome-cli-code">gh auth login</code>
                  <button
                    type="button"
                    className={`welcome-copy-btn ${copiedCli ? "copied" : ""}`}
                    onClick={copyCliLogin}
                    title="Kopiere 'gh auth login'"
                  >
                    {copiedCli ? "✓ Kopiert" : "Kopieren"}
                  </button>
                </div>
              </div>
            </section>

            {/* Bento 2: Recent Projects */}
            <section className="welcome-card-box welcome-recent-card" aria-label="Zuletzt geöffnet">
              <div className="welcome-card-header">
                <span className="welcome-card-tag">PROJEKTE</span>
                <h2 className="welcome-card-title">Zuletzt geöffnet</h2>
                <span className="welcome-card-count">{filteredRecent.length}</span>
              </div>

              <div className="welcome-search-box">
                <span className="welcome-search-icon">🔍</span>
                <input
                  type="text"
                  className="welcome-search-input"
                  value={recentSearch}
                  onChange={(e) => setRecentSearch(e.target.value)}
                  placeholder="Projekte filtern... (1–9 für Schnellstart)"
                  spellCheck={false}
                />
                {recentSearch && (
                  <button
                    type="button"
                    className="welcome-search-clear"
                    onClick={() => setRecentSearch("")}
                    aria-label="Filter leeren"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="welcome-recent-list">
                {filteredRecent.length === 0 ? (
                  <div className="welcome-empty-recent">
                    {allRecent.length === 0
                      ? "Noch keine Projekte geöffnet. Klicke auf 'Ordner öffnen'."
                      : "Kein Projekt entspricht der Suche."}
                  </div>
                ) : (
                  filteredRecent.map((f, i) => (
                    <button
                      key={f.root}
                      type="button"
                      className="welcome-recent-item"
                      onClick={() => pick(f.root)}
                      title={f.root}
                    >
                      {i < 9 ? (
                        <kbd className="welcome-recent-key">{i + 1}</kbd>
                      ) : (
                        <span className="welcome-recent-bullet">•</span>
                      )}
                      <span className="welcome-recent-icon">📁</span>
                      <div className="welcome-recent-details">
                        <span className="welcome-recent-name">{f.name}</span>
                        <span className="welcome-recent-path">{f.root}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            {/* Bento 3: Themes & Extensibility */}
            <section className="welcome-card-box welcome-ext-card" aria-label="Design & Erweiterbarkeit">
              <div className="welcome-card-header">
                <span className="welcome-card-tag">DESIGN & EXTENSIONS</span>
                <h2 className="welcome-card-title">Themes & Erweiterungen</h2>
              </div>

              <div className="welcome-theme-section">
                <div className="welcome-subhead">
                  <span className="welcome-subhead-icon">🎨</span>
                  <span>Live Theme Palette</span>
                </div>
                <div className="welcome-theme-grid">
                  {THEME_OPTIONS.map((t) => {
                    const isActive = activeTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`welcome-theme-chip ${isActive ? "active" : ""}`}
                        onClick={() => handleThemeChange(t.id)}
                        title={`${t.name} (${t.desc})`}
                      >
                        <span className="welcome-theme-dot" style={{ backgroundColor: t.accent }} />
                        <span className="welcome-theme-name">{t.name}</span>
                        {isActive && <span className="welcome-theme-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="welcome-ext-section">
                <div className="welcome-subhead">
                  <span className="welcome-subhead-icon">🧩</span>
                  <span>Erweiterungs-Architektur</span>
                </div>
                <p className="welcome-ext-desc">
                  Ayaz ist vollständig dezentral erweiterbar. Erstelle eigene Themes, Custom Keymaps, LSP-Profile oder
                  Plugins direkt im Benutzerverzeichnis.
                </p>
                <div className="welcome-ext-features">
                  <div className="welcome-ext-pill">
                    <strong>Themes:</strong> <code>settings.json</code>
                  </div>
                  <div className="welcome-ext-pill">
                    <strong>Keymaps:</strong> <code>keymap.json</code>
                  </div>
                  <div className="welcome-ext-pill">
                    <strong>LSP:</strong> Auto aus <code>$PATH</code>
                  </div>
                  <div className="welcome-ext-pill">
                    <strong>Extensions:</strong> <code>~/.config/ayaz/extensions</code>
                  </div>
                </div>
                <div className="welcome-ext-actions">
                  <button
                    type="button"
                    className="welcome-btn-sm primary"
                    onClick={() => void backend.openSettings()}
                  >
                    📂 Config-Ordner öffnen
                  </button>
                  <button
                    type="button"
                    className="welcome-btn-sm secondary"
                    onClick={() => void backend.openURL("https://github.com/Mirac61/ayaz")}
                  >
                    📖 Doku & Guide ↗
                  </button>
                </div>
              </div>
            </section>

            {/* Bento 4: Interaktives Tastatur-Cheatsheet */}
            <section className="welcome-card-box welcome-cheatsheet-card" aria-label="Tastatur-Cheatsheet">
              <div className="welcome-card-header">
                <span className="welcome-card-tag">TASTATUR-FIRST</span>
                <h2 className="welcome-card-title">Interaktive Tastatur-Referenz</h2>
              </div>

              <div className="welcome-cheatsheet-tabs">
                {(Object.keys(CHEATSHEET) as CheatsheetCategory[]).map((cat) => {
                  const item = CHEATSHEET[cat];
                  const isActive = cheatsheetTab === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={`welcome-cs-tab ${isActive ? "active" : ""}`}
                      onClick={() => setCheatsheetTab(cat)}
                    >
                      <span className="welcome-cs-tab-icon">{item.icon}</span>
                      <span>{item.title}</span>
                    </button>
                  );
                })}
              </div>

              <div className="welcome-cs-grid">
                {CHEATSHEET[cheatsheetTab].items.map((it) => (
                  <div key={it.label} className="welcome-cs-item">
                    <div className="welcome-cs-keys">
                      {it.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </div>
                    <span className="welcome-cs-label">{it.label}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Git Clone Modal */}
      {showCloneModal && (
        <div className="welcome-modal-backdrop" onClick={() => setShowCloneModal(false)}>
          <div className="welcome-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="welcome-modal-header">
              <div className="welcome-modal-title">
                <span className="welcome-modal-icon">⎇</span>
                <span>Git Repository clonen</span>
              </div>
              <button
                type="button"
                className="welcome-modal-close"
                onClick={() => setShowCloneModal(false)}
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>

            <div className="welcome-modal-body">
              <label className="welcome-modal-label" htmlFor="clone-url-input">
                Repository URL oder Shorthand (z.B. owner/repo):
              </label>
              <input
                id="clone-url-input"
                type="text"
                className="welcome-modal-input"
                placeholder="https://github.com/Mirac61/ayaz.git oder Mirac61/ayaz"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleClone();
                  if (e.key === "Escape") setShowCloneModal(false);
                }}
                autoFocus
                spellCheck={false}
              />

              <div className="welcome-modal-presets">
                <span className="welcome-preset-label">Beispiel:</span>
                <button
                  type="button"
                  className="welcome-preset-chip"
                  onClick={() => setCloneUrl("Mirac61/ayaz")}
                >
                  Mirac61/ayaz
                </button>
              </div>

              {cloneLoading && (
                <div className="welcome-modal-loading">
                  <span className="welcome-spinner" />
                  <span>Repository wird geklont... Bitte Zielordner im Dialog wählen</span>
                </div>
              )}
            </div>

            <div className="welcome-modal-footer">
              <button
                type="button"
                className="welcome-btn secondary"
                onClick={() => setShowCloneModal(false)}
                disabled={cloneLoading}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="welcome-btn secondary"
                onClick={async () => {
                  if (!cloneUrl.trim()) return;
                  const full = cloneUrl.includes("://") ? cloneUrl : `https://github.com/${cloneUrl}.git`;
                  await backend.copy(`git clone ${full}`);
                  setCopiedClone(true);
                  setTimeout(() => setCopiedClone(false), 2000);
                }}
              >
                {copiedClone ? "✓ Befehl kopiert" : "Clone-Befehl kopieren"}
              </button>
              <button
                type="button"
                className="welcome-btn primary"
                onClick={handleClone}
                disabled={cloneLoading || !cloneUrl.trim()}
              >
                {cloneLoading ? "Klonen…" : "In Ordner clonen & öffnen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {picker && <Picker source={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}
