import { useEffect, useState } from "react";
import { updaterStore, type UpdateProgress, type UpdateState } from "../core/updater";
import type { UpdateInfo } from "../core/backend";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const latest = info?.latestVersion || "unknown";
  const current = info?.currentVersion || "0.2.1";

  return (
    <div className="picker-backdrop update-dialog-backdrop" onClick={state !== "downloading" ? onClose : undefined}>
      <div className="update-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="update-dialog-header">
          <div className="update-dialog-title-row">
            <span className="update-dialog-icon">🚀</span>
            <div className="update-dialog-title-group">
              <h3 className="update-dialog-title">Ayaz Update Available</h3>
              <div className="update-dialog-version-badge">
                <span className="ver current">v{current}</span>
                <span className="arrow">➔</span>
                <span className="ver latest">v{latest}</span>
                {info?.assetSize ? <span className="size">({formatBytes(info.assetSize)})</span> : null}
              </div>
            </div>
          </div>
          {state !== "downloading" && (
            <button className="update-dialog-close" onClick={onClose} aria-label="Close dialog">✕</button>
          )}
        </div>

        {info?.releaseNotes ? (
          <div className="update-dialog-body">
            <div className="update-dialog-section-label">Release Notes:</div>
            <div className="update-dialog-notes">
              <pre>{info.releaseNotes}</pre>
            </div>
          </div>
        ) : null}

        {state === "downloading" && (
          <div className="update-dialog-progress-section">
            <div className="update-dialog-progress-bar-bg">
              <div
                className="update-dialog-progress-bar-fill"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
            <div className="update-dialog-progress-meta">
              <span>Downloading update...</span>
              <span>{progress?.percent ?? 0}% {progress?.written && progress?.total ? `(${formatBytes(progress.written)} / ${formatBytes(progress.total)})` : ""}</span>
            </div>
          </div>
        )}

        {state === "ready" && (
          <div className="update-dialog-ready-message">
            ✓ Update downloaded and staged! Restart Ayaz to apply the update.
          </div>
        )}

        {error && (
          <div className="update-dialog-error-message">
            ⚠ {error}
          </div>
        )}

        <div className="update-dialog-actions">
          {state === "ready" ? (
            <>
              <button className="update-btn secondary" onClick={onClose}>Later</button>
              <button className="update-btn primary" onClick={handleRestart} disabled={isBusy}>
                Restart Ayaz Now
              </button>
            </>
          ) : state === "downloading" ? (
            <button className="update-btn primary" disabled>
              Downloading... ({progress?.percent ?? 0}%)
            </button>
          ) : state === "error" ? (
            <>
              <button className="update-btn secondary" onClick={onClose}>Close</button>
              <button className="update-btn primary" onClick={handleDownload} disabled={isBusy}>
                Retry Download
              </button>
            </>
          ) : (
            <>
              <button className="update-btn secondary" onClick={onClose}>Later</button>
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
