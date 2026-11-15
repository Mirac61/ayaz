import React, { useCallback, useEffect, useRef, useState } from "react";
import { backend, type Info, type Summary } from "../core/backend";
import { defaultKeymap, isMac } from "../core/keymap";
import { closeLsp } from "../editor/lsp";
import { errText } from "./commands/context";
import { rememberFolder, recentFolders } from "./folders";
import { Picker, type PickerSource } from "./Picker";
import { setZoom, zoomLevel } from "./zoom";
import { Workbench } from "./Workbench";
import { CHART, MAX_STARS, stars } from "./constellation";
import { ago, branchText, changedNames, changesText, clip, sky } from "./startPage";
import { DocsHub } from "./DocsHub";
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
const keysOf = (...ids: string[]) =>
  defaultKeymap()
    .filter((b) => ids.includes(b.command))
    .map((b) => b.keys);
const FIRST_KEYS: [keys: string[], what: string][] = [
  [keysOf("find.files"), "Find files"],
  [keysOf("find.grep"), "Search in files"],
  [keysOf("find.commands"), "All commands and their keys"],
  [keysOf("term.panel"), "Terminal"],
  [["gd", "gr", "K"], "Definition, references, hover"],
  [[":w", ":q"], "Save, close"],
];

const SKY = sky();

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
  const [showDocs, setShowDocs] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloning, setCloning] = useState(false);
  const [initial, setInitial] = useState<string | undefined>(); // a file the next workbench opens first

  const [sel, setSel] = useState(0); // the star the detail block shows
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState<Record<string, Summary | null>>({}); // git state per recent folder, null: unreadable
  const field = useRef<HTMLInputElement>(null);

  const [repo, setRepo] = useState("Mirac61/ayaz");
  const [issues, setIssues] = useState<GitHubItem[] | "loading" | "failed">("loading");
  const issuesReqId = useRef(0);

  const show = (w: Info | null) => {
    if (w) rememberFolder(w);
    setInitial(undefined);
    setWs(w);
  };

  const fetchIssues = async (name: string) => {
    const clean = name
      .trim()
      .replace(/^https?:\/\/github\.com\//, "")
      .replace(/\.git$/, "");
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
    for (const f of recentFolders().slice(0, MAX_STARS)) {
      backend.folderSummary(f.root).then(
        (v) => setInfo((m) => ({ ...m, [f.root]: v })),
        () => setInfo((m) => ({ ...m, [f.root]: null })),
      );
    }
  }, []);

  const open = (root: string | null) => (root ? backend.openFolder(root) : backend.openFolderDialog());
  const pick = (root: string | null) =>
    open(root).then(
      (w) => w && show(w),
      (e) => setErr(errText(e)),
    );

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
  const chart = stars(recent.length);
  const term = query.trim().toLowerCase();
  const hit = chart.map((p) => !term || recent[p.i].name.toLowerCase().includes(term) || recent[p.i].root.toLowerCase().includes(term));
  const cur = hit[sel] ? sel : hit.indexOf(true); // -1: nothing matches
  const curFolder = recent[cur];
  const curInfo = curFolder ? info[curFolder.root] : undefined;
  const move = (d: number) => {
    const hits = chart.filter((p) => hit[p.i]).map((p) => p.i);
    if (hits.length) setSel(hits[(Math.max(0, hits.indexOf(cur)) + d + hits.length) % hits.length]);
  };

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
  const tiles: { key: string; label: string; sub?: string; run: () => void }[] = [
    { key: "o", label: "Open folder", run: () => void pick(null) },
    { key: "t", label: "Theme", sub: theme, run: openThemePicker },
    { key: "c", label: "Clone repository", run: () => setShowClone(true) },
    { key: "?", label: "Docs", run: () => setShowDocs(true) },
    { key: "n", label: "New window", run: () => void backend.newWindow() },
    { key: ",", label: "Settings", run: () => void backend.openSettings() },
  ];
  const singleKeys = Object.fromEntries(tiles.map((t) => [t.key, t.run]));

  const onKey = (e: React.KeyboardEvent) => {
    if (picker || showClone || showDocs) return;
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
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = (e.target as HTMLElement).closest("input");
    if (e.key === "ArrowDown" || (!typing && e.key === "j")) {
      e.preventDefault();
      return move(1);
    }
    if (e.key === "ArrowUp" || (!typing && e.key === "k")) {
      e.preventDefault();
      return move(-1);
    }
    if (typing) {
      if (e.key === "Escape") {
        setQuery("");
        field.current?.blur();
        focusPage();
      } else if (e.key === "Enter" && e.target === field.current && curFolder) void pick(curFolder.root);
      return;
    }
    const num = Number(e.key);
    if (num >= 1 && num <= MAX_STARS && recent[num - 1]) return setSel(num - 1);
    if (e.key === "Enter" && e.target === page.current && curFolder) return void pick(curFolder.root);
    if (e.key === "r") {
      e.preventDefault();
      return field.current?.focus();
    }
    const run = singleKeys[e.key];
    if (run) {
      e.preventDefault();
      run();
    }
  };

  const issueList = Array.isArray(issues) ? issues : [];
  const prs = issueList.filter((it) => it.isPR).length;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  return (
    <div className="welcome" onKeyDown={onKey} tabIndex={-1} ref={focusOnMount}>
      <svg className="welcome-sky" viewBox="0 0 1200 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {SKY.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.big ? "var(--star)" : "var(--fg-2)"} opacity={d.o} />
        ))}
      </svg>
      <div className="titlebar" />

      <div className="welcome-scroll">
        <div className="start">
          <div className="start-left">
            <h1 className="start-word">ayaz</h1>
            <p className="start-tag">Clear as a frosty night.</p>

            <label className="start-ask">
              <input
                ref={field}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a folder"
                aria-label="Find a folder"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd aria-hidden="true">r</kbd>
            </label>

            {err && <div className="welcome-err">{err}</div>}

            <section className="start-acts" aria-label="Start">
              {tiles.map((t) => (
                <button key={t.key} type="button" className="start-act" onClick={t.run}>
                  <kbd aria-hidden="true">{t.key}</kbd>
                  {t.label}
                  {t.sub && <small>{t.sub}</small>}
                </button>
              ))}
            </section>

            <section aria-label="Issues">
              <div className="start-gh">
                <input
                  className="welcome-repo"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void fetchIssues(repo)}
                  aria-label="GitHub repository (owner/repo), Enter to load"
                  spellCheck={false}
                />
                {Array.isArray(issues) && issueList.length > 0 && (
                  <span>
                    {plural(issueList.length - prs, "issue")}, {plural(prs, "pull request")}
                  </span>
                )}
              </div>
              {issues === "loading" && <p className="welcome-empty">Loading…</p>}
              {issues === "failed" && <p className="welcome-empty">Couldn't reach GitHub. Press Enter in the field to retry.</p>}
              {Array.isArray(issues) && issueList.length === 0 && <p className="welcome-empty">Nothing open. Enjoy the quiet.</p>}
              {issueList.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`start-iss ${it.isPR ? "pr" : ""}`}
                  onClick={() => void backend.openURL(it.url)}
                  title={`Open ${it.isPR ? "pull request" : "issue"} #${it.number} in the browser`}
                >
                  {it.isPR ? (
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="4" cy="4" r="1.6" />
                      <circle cx="4" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <path d="M4 5.6v4.8M12 10.4V7a2 2 0 0 0-2-2H8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="8" cy="8" r="5.5" />
                      <circle cx="8" cy="8" r="1" fill="currentColor" />
                    </svg>
                  )}
                  <span>{it.title}</span>
                  <small>
                    #{it.number} {it.updatedAt}
                  </small>
                </button>
              ))}
            </section>
          </div>

          <nav className="start-map" aria-label="Recent folders">
            {recent.length === 0 ? (
              <div className="start-none">
                <p>No folders yet.</p>
                <p>Open one and it becomes the first star here.</p>
              </div>
            ) : (
              <>
                <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`}>
                  <polyline points={chart.map((p) => `${p.x},${p.y}`).join(" ")} opacity={term ? 0.3 : 1} />
                  {chart.map((p) => {
                    const f = recent[p.i];
                    const on = p.i === cur;
                    const dirty = (info[f.root]?.changed?.length ?? 0) > 0;
                    return (
                      <g
                        key={f.root}
                        role="button"
                        tabIndex={0}
                        aria-label={f.name}
                        className={on ? "on" : ""}
                        opacity={hit[p.i] ? 1 : 0.16}
                        onClick={() => void pick(f.root)}
                        onMouseEnter={() => setSel(p.i)}
                        onFocus={() => setSel(p.i)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), void pick(f.root))}
                      >
                        <title>{shorten(f.root)}</title>
                        <circle cx={p.x} cy={p.y} r="20" fill="transparent" />
                        {on ? (
                          <>
                            <circle cx={p.x} cy={p.y} r="20" className="halo" />
                            <path className="star" transform={`translate(${p.x} ${p.y}) scale(1.4)`} d="M0-8 1.7-1.7 8 0 1.7 1.7 0 8-1.7 1.7-8 0-1.7-1.7Z" />
                          </>
                        ) : (
                          <circle cx={p.x} cy={p.y} r={p.r} className="dot" opacity={p.opacity} />
                        )}
                        {dirty && <circle cx={p.x} cy={p.y} r={on ? 15 : p.r + 4.5} className="ring" opacity={on ? 0.7 : 1} />}
                        <text x={p.x + p.dx} y={p.y + p.dy} textAnchor={p.end ? "end" : "start"} className="nm">
                          {clip(f.name)}
                          <tspan className="ky" dx="6">
                            {p.i + 1}
                          </tspan>
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <p className="start-leg">Brighter was opened more recently. A ring means uncommitted changes.</p>
                {curFolder && (
                  <div className="start-det">
                    <div>
                      <h3>{curFolder.name}</h3>
                      <div className="pth">{shorten(curFolder.root)}</div>
                    </div>
                    <span className="go">
                      <kbd>Enter</kbd> opens it
                    </span>
                    <dl>
                      {curInfo && (
                        <>
                          <dt>Branch</dt>
                          <dd>{branchText(curInfo)}</dd>
                          {curInfo.repo && (
                            <>
                              <dt>Changes</dt>
                              <dd>{changesText(curInfo)}</dd>
                            </>
                          )}
                        </>
                      )}
                      {curFolder.at && (
                        <>
                          <dt>Opened</dt>
                          <dd>{ago(curFolder.at)}</dd>
                        </>
                      )}
                      {(curInfo?.changed?.length ?? 0) > 0 && (
                        <>
                          <dt>Files</dt>
                          <dd>{changedNames(curInfo!)}</dd>
                        </>
                      )}
                    </dl>
                  </div>
                )}
              </>
            )}
          </nav>
        </div>
      </div>

      <footer className="welcome-keys" aria-label="Keys" role="region">
        {FIRST_KEYS.map(([keys, what]) => (
          <span key={what} className="welcome-key">
            <kbd>{keys[0]}</kbd>
            <span>{what}</span>
          </span>
        ))}
      </footer>

      {showClone && (
        <div className="picker-backdrop" onClick={() => !cloning && closeClone()}>
          <div
            className="picker welcome-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Clone repository"
          >
            <div className="picker-head">
              <span className="picker-title">Clone repository</span>
              <button type="button" className="welcome-modal-close" onClick={() => !cloning && closeClone()} aria-label="Close">
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

      {showDocs && (
        <DocsHub
          onClose={() => {
            setShowDocs(false);
            focusPage();
          }}
        />
      )}
    </div>
  );
}
