// The command palette's last picks, most recent first, so an empty palette starts with what you used (all windows share it).
const KEY = "ayaz.recentCommands";
const MAX = 6;

// Moves title to the front of a list, once, cut to MAX.
export const touch = (list: string[], title: string) => [title, ...list.filter((t) => t !== title)].slice(0, MAX);

export function recentCommands(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
  } catch {
    return []; // storage blocked or corrupt
  }
}

export function rememberCommand(title: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(touch(recentCommands(), title)));
  } catch { /* a convenience */ }
}
