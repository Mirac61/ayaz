// Whether the editors show a line's worst diagnostic after the line. A per-user convenience, kept like the tab bar's state.
const KEY = "ayaz.diagText";

export function applyDiagText() {
  let off = false;
  try { off = localStorage.getItem(KEY) === "off"; } catch { /* a convenience */ }
  document.documentElement.dataset.diagText = off ? "off" : "on";
}

// Flips it; returns whether the text is shown now.
export function toggleDiagText(): boolean {
  const on = document.documentElement.dataset.diagText === "off";
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* a convenience */ }
  applyDiagText();
  return on;
}
