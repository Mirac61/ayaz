// Harpoon: quickly pin and jump between core files in a project (<Space>a to mark, <Space>1..4 to jump).

export const MAX_SLOTS = 9;

export function harpoonKey(root: string): string {
  return `ayaz.harpoon:${root}`;
}

export function loadHarpoon(root: string): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(harpoonKey(root));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export function saveHarpoon(root: string, items: string[]) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(harpoonKey(root), JSON.stringify(items.slice(0, MAX_SLOTS)));
  } catch {
    /* a convenience */
  }
}

export function toggleHarpoon(root: string, path: string): { items: string[]; added: boolean; index: number } {
  const items = loadHarpoon(root);
  const existing = items.indexOf(path);
  if (existing >= 0) {
    items.splice(existing, 1);
    saveHarpoon(root, items);
    return { items, added: false, index: existing + 1 };
  }
  items.push(path);
  const trimmed = items.slice(0, MAX_SLOTS);
  saveHarpoon(root, trimmed);
  return { items: trimmed, added: true, index: trimmed.length };
}

export function removeHarpoon(root: string, index: number): string[] {
  const items = loadHarpoon(root);
  if (index >= 0 && index < items.length) {
    items.splice(index, 1);
    saveHarpoon(root, items);
  }
  return items;
}
