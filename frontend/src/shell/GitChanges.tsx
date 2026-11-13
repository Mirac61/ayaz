import React, { useEffect, useRef, useState } from "react";
import type { FileStatus } from "../../bindings/github.com/Mirac61/ayaz/internal/git";
import { fileIcon } from "../theme/icons";
import { ContextMenu, type MenuItem } from "../ui/ui";
import { Glyph } from "./Tree";

export interface GitItem {
  path: string;
  status: string; // "M" | "A" | "D" | "?" | "U" | "R"
  isStaged: boolean;
  key: string;
}

interface Props {
  status: Record<string, string>;
  detailedFiles?: FileStatus[];
  branch: string;
  onOpen(path: string): void;
  onDiff(path: string): void;
  onDiffSplit?(path: string): void;
  onLeave(): void;
  onLazygit(): void;
  onStageFile?(path: string): Promise<void>;
  onUnstageFile?(path: string): Promise<void>;
  onDiscardFile?(path: string): Promise<void>;
  onStageAll?(): Promise<void>;
  onUnstageAll?(): Promise<void>;
  onCommit?(msg: string): Promise<void>;
  onPush?(): Promise<void> | void;
  onPull?(): Promise<void> | void;
  onFetch?(): Promise<void> | void;
  onRebase?(): Promise<void> | void;
}

const GIT_BADGE: Record<string, string> = {
  M: "M",
  A: "A",
  D: "D",
  "?": "U",
  U: "!",
  R: "R",
};

const GIT_CLASS: Record<string, string> = {
  M: "git-mod",
  A: "git-add",
  D: "git-del",
  "?": "git-add",
  U: "git-conflict",
  R: "git-mod",
};

export const GitChanges: React.FC<Props> = ({
  status,
  detailedFiles,
  branch,
  onOpen,
  onDiff,
  onDiffSplit,
  onLeave,
  onLazygit,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageAll,
  onUnstageAll,
  onCommit,
  onPush,
  onPull,
  onFetch,
  onRebase,
}) => {
  const el = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [busyRemote, setBusyRemote] = useState<string | null>(null);
  const commitInputRef = useRef<HTMLTextAreaElement>(null);

  // Group items into Staged and Unstaged
  let stagedItems: GitItem[] = [];
  let unstagedItems: GitItem[] = [];

  if (detailedFiles && detailedFiles.length > 0) {
    const sorted = [...detailedFiles].sort((a, b) =>
      a.path.toLowerCase().localeCompare(b.path.toLowerCase()),
    );
    for (const f of sorted) {
      if (f.staged) {
        stagedItems.push({ path: f.path, status: f.status, isStaged: true, key: `s:${f.path}` });
      }
      if (f.unstaged) {
        unstagedItems.push({ path: f.path, status: f.status, isStaged: false, key: `u:${f.path}` });
      }
    }
  } else {
    // Fallback: simple status map
    unstagedItems = Object.entries(status)
      .filter(([_, code]) => code !== "!")
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([path, code]) => ({
        path,
        status: code,
        isStaged: false,
        key: `u:${path}`,
      }));
  }

  const allItems: GitItem[] = [...stagedItems, ...unstagedItems];
  const cur = Math.max(0, Math.min(cursor, allItems.length - 1));

  useEffect(() => {
    el.current?.focus();
  }, []);

  const openItem = (path: string) => {
    onOpen(path);
  };

  const diffItem = (path: string) => {
    onDiff(path);
  };

  const diffSplitItem = (path: string) => {
    if (onDiffSplit) onDiffSplit(path);
    else onDiff(path);
  };

  const handleCommit = async () => {
    const trimmed = commitMsg.trim();
    if (!trimmed || committing || stagedItems.length === 0) return;
    setCommitting(true);
    try {
      await onCommit?.(trimmed);
      setCommitMsg("");
      el.current?.focus();
    } catch {
      // Handled by caller
    } finally {
      setCommitting(false);
    }
  };

  const handleStageToggle = (item: GitItem) => {
    if (item.isStaged) {
      onUnstageFile?.(item.path);
    } else {
      onStageFile?.(item.path);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (confirmDiscard) {
      if (e.key === "Enter" || e.key === "y" || e.key === "d") {
        e.preventDefault();
        const p = confirmDiscard;
        setConfirmDiscard(null);
        void onDiscardFile?.(p);
      } else if (e.key === "Escape" || e.key === "n") {
        e.preventDefault();
        setConfirmDiscard(null);
      }
      return;
    }

    switch (e.key) {
      case "j":
      case "ArrowDown":
        setCursor((c) => Math.min(allItems.length - 1, c + 1));
        break;
      case "k":
      case "ArrowUp":
        setCursor((c) => Math.max(0, c - 1));
        break;
      case "g":
        setCursor(0);
        break;
      case "G":
        setCursor(allItems.length - 1);
        break;
      case "Enter":
      case "o":
        if (allItems[cur]) openItem(allItems[cur].path);
        break;
      case "c":
        e.preventDefault();
        commitInputRef.current?.focus();
        break;
      case "d":
        if (allItems[cur]) diffItem(allItems[cur].path);
        break;
      case "D":
        if (allItems[cur]) diffSplitItem(allItems[cur].path);
        break;
      case "s":
        if (allItems[cur]) handleStageToggle(allItems[cur]);
        break;
      case "+":
      case "a":
        if (allItems[cur] && !allItems[cur].isStaged) {
          void onStageFile?.(allItems[cur].path);
        } else if (!allItems[cur]) {
          void onStageAll?.();
        }
        break;
      case "-":
      case "u":
        if (allItems[cur] && allItems[cur].isStaged) {
          void onUnstageFile?.(allItems[cur].path);
        } else if (!allItems[cur]) {
          void onUnstageAll?.();
        }
        break;
      case "x":
      case "X":
        if (allItems[cur]) {
          setConfirmDiscard(allItems[cur].path);
        }
        break;
      case "Escape":
        onLeave();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const onContextMenu = (e: React.MouseEvent, item: GitItem, i: number) => {
    e.preventDefault();
    setCursor(i);
    const menuItems: MenuItem[] = [
      item.isStaged
        ? { label: "Unstage file", hint: "u", run: () => void onUnstageFile?.(item.path) }
        : { label: "Stage file", hint: "s", run: () => void onStageFile?.(item.path) },
      { label: "Discard changes...", hint: "x", run: () => setConfirmDiscard(item.path) },
      { label: "Diff split against HEAD", hint: "D", run: () => diffSplitItem(item.path) },
      { label: "Inline diff against HEAD", hint: "d", run: () => diffItem(item.path) },
      { label: "Open file", hint: "Enter", run: () => openItem(item.path) },
      { label: "Open Lazygit", hint: "<Space>gg", run: onLazygit },
    ];
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: menuItems,
    });
  };

  const renderSection = (
    title: string,
    items: GitItem[],
    startIndex: number,
    isStagedSection: boolean,
  ) => {
    if (items.length === 0) return null;

    return (
      <div className="git-changes-section" key={title}>
        <div className="git-section-header">
          <span className="git-section-title">
            {title} ({items.length})
          </span>
          <div className="git-section-actions">
            {isStagedSection ? (
              <button
                type="button"
                className="git-action-btn"
                title="Unstage all changes"
                onClick={(e) => {
                  e.stopPropagation();
                  void onUnstageAll?.();
                }}
              >
                Unstage all
              </button>
            ) : (
              <button
                type="button"
                className="git-action-btn"
                title="Stage all changes"
                onClick={(e) => {
                  e.stopPropagation();
                  void onStageAll?.();
                }}
              >
                Stage all
              </button>
            )}
          </div>
        </div>
        {items.map((item, localIdx) => {
          const globalIdx = startIndex + localIdx;
          const isSelected = globalIdx === cur;
          const slash = item.path.lastIndexOf("/");
          const dir = slash >= 0 ? item.path.slice(0, slash + 1) : "";
          const name = slash >= 0 ? item.path.slice(slash + 1) : item.path;
          const badge = GIT_BADGE[item.status] ?? item.status;
          const colorClass = GIT_CLASS[item.status] ?? "git-mod";

          return (
            <div
              key={item.key}
              className={`git-change-row ${isSelected ? "cursor" : ""}`}
              onClick={() => {
                setCursor(globalIdx);
                openItem(item.path);
              }}
              onContextMenu={(e) => onContextMenu(e, item, globalIdx)}
            >
              <Glyph icon={fileIcon(item.path)} />
              <div className="git-change-path">
                {dir && <span className="git-change-dir">{dir}</span>}
                <span className={`git-change-name ${colorClass}`}>{name}</span>
              </div>
              <div className="git-row-actions">
                {item.isStaged ? (
                  <button
                    type="button"
                    className="git-icon-btn"
                    title="Unstage changes (u)"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onUnstageFile?.(item.path);
                    }}
                  >
                    -
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="git-icon-btn"
                      title="Stage changes (s)"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onStageFile?.(item.path);
                      }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="git-icon-btn"
                      title="Discard changes (x)"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDiscard(item.path);
                      }}
                    >
                      ↺
                    </button>
                  </>
                )}
              </div>
              <span className={`tree-git-badge ${colorClass}`}>{badge}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={el}
      className="git-changes"
      tabIndex={0}
      role="region"
      aria-label="Git changes"
      onKeyDown={onKeyDown}
    >
      <div className="git-changes-header">
        <div className="git-changes-branch">
          <Glyph icon={["\ue725", "inherit"]} />
          <span className="branch-name">{branch || "no repository"}</span>
        </div>
        <div className="git-remote-toolbar">
          {onPush && (
            <button
              type="button"
              className="git-remote-btn"
              disabled={busyRemote !== null}
              onClick={async () => {
                setBusyRemote("push");
                try {
                  await onPush();
                } finally {
                  setBusyRemote(null);
                }
              }}
              title="Git Push: Lokale Commits auf Remote übertragen"
            >
              {busyRemote === "push" ? "⇡…" : "⇡ Push"}
            </button>
          )}
          {onPull && (
            <button
              type="button"
              className="git-remote-btn"
              disabled={busyRemote !== null}
              onClick={async () => {
                setBusyRemote("pull");
                try {
                  await onPull();
                } finally {
                  setBusyRemote(null);
                }
              }}
              title="Git Pull: Änderungen von Remote holen"
            >
              {busyRemote === "pull" ? "⇣…" : "⇣ Pull"}
            </button>
          )}
          {onFetch && (
            <button
              type="button"
              className="git-remote-btn icon-only"
              disabled={busyRemote !== null}
              onClick={async () => {
                setBusyRemote("fetch");
                try {
                  await onFetch();
                } finally {
                  setBusyRemote(null);
                }
              }}
              title="Git Fetch: Remote-Refs abrufen"
            >
              {busyRemote === "fetch" ? "⟳…" : "⟳"}
            </button>
          )}
        </div>
      </div>

      {onCommit && (
        <div className="git-commit-box">
          <textarea
            ref={commitInputRef}
            className="git-commit-input"
            placeholder={
              stagedItems.length > 0
                ? "Commit message (Ctrl+Enter to commit)..."
                : "Commit message (stage changes first)..."
            }
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void handleCommit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                el.current?.focus();
              }
            }}
            rows={2}
          />
          <div className="git-commit-actions">
            <span className="git-commit-meta">
              {stagedItems.length} {stagedItems.length === 1 ? "staged change" : "staged changes"}
            </span>
            <button
              type="button"
              className="git-commit-btn"
              disabled={committing || !commitMsg.trim() || stagedItems.length === 0}
              onClick={() => void handleCommit()}
              title={
                stagedItems.length === 0
                  ? "Stage changes first to commit"
                  : "Commit staged changes (Ctrl+Enter)"
              }
            >
              {committing ? "Committing..." : "Commit"}
            </button>
          </div>
        </div>
      )}

      {confirmDiscard && (
        <div className="git-confirm-discard">
          <div className="git-confirm-text">
            Discard changes to <strong>{confirmDiscard}</strong>?
          </div>
          <div className="git-confirm-sub">This cannot be undone.</div>
          <div className="git-confirm-actions">
            <button
              type="button"
              className="git-confirm-btn danger"
              onClick={() => {
                const p = confirmDiscard;
                setConfirmDiscard(null);
                void onDiscardFile?.(p);
              }}
            >
              Discard (Enter)
            </button>
            <button
              type="button"
              className="git-confirm-btn"
              onClick={() => setConfirmDiscard(null)}
            >
              Cancel (Esc)
            </button>
          </div>
        </div>
      )}

      {allItems.length === 0 ? (
        <div className="git-changes-empty">
          <div className="empty-icon">✓</div>
          <div className="empty-title">Working tree clean</div>
          <div className="empty-sub">No staged or unstaged changes</div>
        </div>
      ) : (
        <div className="git-changes-list">
          {renderSection("Staged Changes", stagedItems, 0, true)}
          {renderSection("Changes", unstagedItems, stagedItems.length, false)}
        </div>
      )}

      {menu && <ContextMenu at={{ x: menu.x, y: menu.y }} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};
