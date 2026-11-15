import { backend } from "../core/backend";

// Page zoom for every window (same origin), like VS Code's: the whole UI scales, terminal and PDFs included.
// A focused terminal zooms its font instead (Editors.zoomTerms).
const ZOOM_KEY = "ayaz.zoom";
export const ZOOM_STEP = 0.1;

export function zoomLevel(): number {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    return z >= 0.5 && z <= 2 ? z : 1;
  } catch {
    return 1; // storage blocked
  }
}

export async function setZoom(z: number) {
  z = Math.round(Math.min(2, Math.max(0.5, z)) * 10) / 10;
  try { localStorage.setItem(ZOOM_KEY, String(z)); } catch { /* a convenience */ }
  await backend.zoom(z);
  return z;
}
