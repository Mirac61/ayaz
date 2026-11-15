// Reactive notification store for floating Noice-style toasts.
export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastAction {
  label: string;
  run(): void;
}

export interface Toast {
  id: string;
  text: string;
  kind: ToastKind;
  duration: number; // ms, 0 = sticky
  timestamp: number;
  action?: ToastAction;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let toasts: Toast[] = [];
let nextId = 1;

export const notify = {
  say(text: string, duration = 3200, action?: ToastAction) {
    return this.add({ text, kind: "success", duration, action });
  },
  info(text: string, duration = 3200, action?: ToastAction) {
    return this.add({ text, kind: "info", duration, action });
  },
  warn(text: string, duration = 4500, action?: ToastAction) {
    return this.add({ text, kind: "warning", duration, action });
  },
  fail(text: string, duration = 5500, action?: ToastAction) {
    return this.add({ text, kind: "error", duration, action });
  },
  add(t: { text: string; kind: ToastKind; duration?: number; action?: ToastAction }): string {
    const id = `toast-${++nextId}`;
    const toast: Toast = {
      id,
      text: t.text,
      kind: t.kind,
      duration: t.duration ?? 3200,
      timestamp: Date.now(),
      action: t.action,
    };
    // Keep at most 5 toasts stacked
    toasts = [...toasts.slice(-4), toast];
    emit();
    if (toast.duration > 0) {
      setTimeout(() => {
        notify.dismiss(id);
      }, toast.duration);
    }
    return id;
  },
  dismiss(id: string) {
    const before = toasts.length;
    toasts = toasts.filter((t) => t.id !== id);
    if (toasts.length !== before) emit();
  },
  clear() {
    toasts = [];
    emit();
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  get toasts() {
    return toasts;
  },
};

function emit() {
  for (const fn of listeners) fn();
}
