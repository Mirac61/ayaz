import type { Info } from "../core/backend";

// Folders opened in any window, most recent first (shared by all windows: same origin).
const FOLDERS_KEY = "ayaz.folders";

export function recentFolders(): { root: string; name: string }[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((f) => typeof f?.root === "string" && typeof f?.name === "string") : [];
  } catch {
    return []; // storage blocked or corrupt
  }
}

export function rememberFolder(w: Info) {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify([{ root: w.root, name: w.name }, ...recentFolders().filter((f) => f.root !== w.root)].slice(0, 20)));
  } catch { /* a convenience */ }
}
