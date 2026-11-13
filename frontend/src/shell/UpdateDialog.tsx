import { useEffect, useState, useMemo } from "react";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { updaterStore, type UpdateProgress, type UpdateState } from "../core/updater";
import { backend, type UpdateInfo } from "../core/backend";
import { AyazLogo } from "./AyazLogo";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeHtml(html: string): string {
  if (typeof DOMPurify.sanitize === "function") {
    return DOMPurify.sanitize(html);
  }
  if (typeof window !== "undefined" && typeof (DOMPurify as any)(window)?.sanitize === "function") {
    return (DOMPurify as any)(window).sanitize(html);
  }
  return html;
}

export function UpdateDialog({ onClose }: { onClose(): void }) {
  const [state, setState] = useState<UpdateState>(updaterStore.state);
  const [info, setInfo] = useState<UpdateInfo | null>(updaterStore.info);
  const [progress, setProgress] = useState<UpdateProgress | null>(updaterStore.progress);
  const [error, setError] = useState<string | null>(updaterStore.error);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    return updaterStore.subscribe(() => {
      setState(updaterStore.state);
      setInfo(updaterStore.info);
      setProgress(updaterStore.progress);
      setError(updaterStore.error);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state !== "downloading") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  const handleDownload = async () => {
    setIsBusy(true);
    try {
      await updaterStore.download();
    } catch {
      // error is reflected in store
    } finally {
      setIsBusy(false);
    }
  };

  const handleRestart = async () => {
    setIsBusy(true);
    try {
      await updaterStore.restart();
    } catch {
      setIsBusy(false);
    }
  };

  const handleNotesClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest("a");
    if (target && target.href) {
      e.preventDefault();
      backend.openURL(target.href);
    }
  };

  const renderedNotes = useMemo(() => {
    if (!info?.releaseNotes) return "";
    const rawHtml = md.render(info.releaseNotes);
    return sanitizeHtml(rawHtml);
  }, [info?.releaseNotes]);

  const latest = info?.latestVersion || "unknown";
  const current = info?.currentVersion || "0.3.2";

  return (
    <div className="picker-backdrop update-dialog-backdrop" onClick={state !== "downloading" ? onClose : undefined}>
      <div className="update-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="update-dialog-header">
          <div className="update-dialog-title-row">
            <div className="update-dialog-logo-wrapper">
              <AyazLogo size={24} variant="frost" className="update-dialog-logo" />
            </div>
            <div className="update-dialog-title-group">
              <div className="update-dialog-title">Ayaz Update Available</div>
              <div className="update-dialog-version-badge">
                <span className="ver current">v{current}</span>
                <span className="arrow">→</span>
                <span className="ver latest">v{latest}</span>
                {info?.assetSize ? <span className="size">· {formatBytes(info.assetSize)}</span> : null}
              </div>
            </div>
          </div>
          {state !== "downloading" && (
            <button
              className="update-dialog-close"
              onClick={onClose}
              aria-label="Close dialog"
              title="Close (Esc)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {renderedNotes ? (
          <div className="update-dialog-body">
            <div className="update-dialog-section-label">Release Notes</div>
            <div
              className="update-dialog-notes"
              dangerouslySetInnerHTML={{ __html: renderedNotes }}
              onClick={handleNotesClick}
            />
          </div>
        ) : null}

        {state === "downloading" && (
          <div className="update-dialog-progress-section">
            <div className="update-dialog-progress-meta">
              <span>Downloading update...</span>
              <span>
                {progress?.percent ?? 0}%
                {progress?.written && progress?.total
                  ? ` (${formatBytes(progress.written)} / ${formatBytes(progress.total)})`
                  : ""}
              </span>
            </div>
            <div className="update-dialog-progress-bar-bg">
              <div
                className="update-dialog-progress-bar-fill"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {state === "ready" && (
          <div className="update-dialog-status-card ready">
            <span className="status-dot ready" aria-hidden="true" />
            <div className="status-text">
              <span className="status-title">Ready to install</span>
              <span className="status-desc">Restart Ayaz to apply the update.</span>
            </div>
          </div>
        )}

        {error && (
          <div className="update-dialog-status-card error">
            <span className="status-dot error" aria-hidden="true" />
            <div className="status-text">
              <span className="status-title">Update failed</span>
              <span className="status-desc">{error}</span>
            </div>
          </div>
        )}

        <div className="update-dialog-actions">
          {state === "ready" ? (
            <>
              <button className="update-btn secondary" onClick={onClose}>
                Later
              </button>
              <button className="update-btn primary" onClick={handleRestart} disabled={isBusy}>
                Restart Ayaz
              </button>
            </>
          ) : state === "downloading" ? (
            <button className="update-btn primary" disabled>
              Downloading... {progress?.percent ?? 0}%
            </button>
          ) : state === "error" ? (
            <>
              <button className="update-btn secondary" onClick={onClose}>
                Dismiss
              </button>
              <button className="update-btn primary" onClick={handleDownload} disabled={isBusy}>
                Retry
              </button>
            </>
          ) : (
            <>
              <button className="update-btn secondary" onClick={onClose}>
                Later
              </button>
              <button className="update-btn primary" onClick={handleDownload} disabled={isBusy}>
                Download & Install
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
