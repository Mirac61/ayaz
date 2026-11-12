import { useEffect, useState } from "react";
import { notify, type Toast } from "../core/notifications";
import "./notifications.css";

const ICONS: Record<string, string> = {
  success: "\uf00c", // checkmark
  info: "\uf05a",    // info-circle
  warning: "\uf071", // exclamation-triangle
  error: "\uf06a",   // exclamation-circle
};

export function Notifications() {
  const [toasts, setToasts] = useState<Toast[]>(() => notify.toasts);

  useEffect(() => {
    return notify.subscribe(() => {
      setToasts([...notify.toasts]);
    });
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="notifications-container" aria-live="polite" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`notification-toast toast-${t.kind}`}
          role="alert"
          onClick={() => notify.dismiss(t.id)}
          title="Click to dismiss"
        >
          <span className="toast-icon">{ICONS[t.kind] || ICONS.info}</span>
          <span className="toast-body">{t.text}</span>
          <button
            type="button"
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation();
              notify.dismiss(t.id);
            }}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
