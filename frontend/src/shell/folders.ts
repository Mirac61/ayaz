import type { Info } from "../core/backend";

// Folders opened in any window, most recent first (shared by all windows: same origin).
const FOLDERS_KEY = "ayaz.folders";

export interface Recent {
  root: string;
  name: string;
  at?: number;
} // at: ms since epoch, missing in older entries

export function recentFolders(): Recent[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((f) => typeof f?.root === "string" && typeof f?.name === "string") : [];
  } catch {
    return []; // storage blocked or corrupt
  }
}

export function rememberFolder(w: Info) {
  try {
    localStorage.setItem(
      FOLDERS_KEY,
      JSON.stringify(
        [{ root: w.root, name: w.name, at: Date.now() }, ...recentFolders().filter((f) => f.root !== w.root)].slice(0, 20),
      ),
    );
  } catch {
    /* a convenience */
  }
}
