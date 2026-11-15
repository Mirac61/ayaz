import { backend, type UpdateInfo } from "./backend";

export type UpdateState = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

export interface UpdateProgress {
  written: number;
  total: number;
  percent: number;
}

export interface UpdaterStore {
  state: UpdateState;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
  check: (manual?: boolean) => Promise<UpdateInfo | null>;
  download: () => Promise<void>;
  restart: () => Promise<void>;
  subscribe: (fn: () => void) => () => void;
}

let state: UpdateState = "idle";
let info: UpdateInfo | null = null;
let progress: UpdateProgress | null = null;
let error: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

let initialized = false;

function initListeners() {
  if (initialized) return;
  initialized = true;

  backend.onUpdateAvailable((newInfo) => {
    info = newInfo;
    state = "available";
    emit();
  });

  backend.onUpdateProgress((p) => {
    progress = p;
    state = "downloading";
    emit();
  });

  backend.onUpdateReady(() => {
    state = "ready";
    progress = null;
    emit();
  });

  backend.onUpdateError((err) => {
    error = err;
    state = "error";
    emit();
  });
}

export const updaterStore: UpdaterStore = {
  get state() { return state; },
  get info() { return info; },
  get progress() { return progress; },
  get error() { return error; },

  subscribe(fn: () => void) {
    initListeners();
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async check(manual = false): Promise<UpdateInfo | null> {
    initListeners();
    state = "checking";
    error = null;
    emit();

    try {
      const res = await backend.checkUpdate();
      if (res && res.available) {
        info = res;
        state = "available";
      } else {
        info = res;
        state = "idle";
      }
      emit();
      return res;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      state = "error";
      emit();
      if (manual) throw e;
      return null;
    }
  },

  async download() {
    state = "downloading";
    error = null;
    emit();
    try {
      await backend.downloadAndInstallUpdate();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      state = "error";
      emit();
      throw e;
    }
  },

  async restart() {
    await backend.restartApp();
  },
};
