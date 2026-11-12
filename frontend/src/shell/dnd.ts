// Drag a file (tree row or tab) onto a pane, like VS Code or Zed: the middle opens it there, an edge splits that side.
// Plain mouse events, not HTML5 drag and drop: the webview's file-drop handling (EnableFileDrop) would swallow those.
export type Zone = "center" | "left" | "right" | "top" | "bottom";
type Drop = (path: string, pane: number, zone: Zone, fromPane: number) => void;

const EDGE = 0.25; // share of the pane's width or height that counts as its edge
const THRESHOLD = 6; // px the pointer moves before a press becomes a drag, so plain clicks still click

let onDrop: Drop = () => {};
export const setDropHandler = (f: Drop) => { onDrop = f; };

export function zoneAt(r: { left: number; top: number; width: number; height: number }, x: number, y: number, isTabbar = false): Zone {
  if (isTabbar) return "center";
  const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
  const near: [Zone, number][] = [["left", fx], ["right", 1 - fx], ["top", fy], ["bottom", 1 - fy]];
  const [zone, d] = near.reduce((a, b) => (b[1] < a[1] ? b : a));
  return d < EDGE ? zone : "center";
}

// The part of the pane's rect that the drop would fill.
function zoneRect(r: { left: number; top: number; width: number; height: number }, z: Zone) {
  const w = z === "left" || z === "right" ? r.width / 2 : r.width, h = z === "top" || z === "bottom" ? r.height / 2 : r.height;
  return { left: z === "right" ? r.left + r.width / 2 : r.left, top: z === "bottom" ? r.top + r.height / 2 : r.top, width: w, height: h };
}

export function startDrag(
  down: { clientX: number; clientY: number; button: number },
  path: string,
  fromPane = -1,
  termTitle?: string
) {
  if (down.button !== 0) return;
  let ghost: HTMLElement | null = null, mark: HTMLElement | null = null;
  let hit: { pane: number; zone: Zone } | null = null;
  const end = () => {
    window.removeEventListener("mousemove", move, true);
    window.removeEventListener("mouseup", up, true);
    window.removeEventListener("keydown", key, true);
    ghost?.remove();
    mark?.remove();
    document.body.classList.remove("dragging");
  };
  const move = (e: MouseEvent) => {
    if (!ghost) {
      if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < THRESHOLD) return;
      const title = termTitle
        ? termTitle
        : path.startsWith("term://")
        ? path.slice(7)
        : path === "__panel_term__"
        ? "terminal"
        : path.slice(path.lastIndexOf("/") + 1);
      ghost = Object.assign(document.createElement("div"), { className: "drag-ghost", textContent: title });
      mark = Object.assign(document.createElement("div"), { className: "drop-zone" });
      document.body.append(ghost, mark);
      document.body.classList.add("dragging");
    }
    ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;

    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-pane]");
    if (el) {
      const paneId = Number(el.dataset.pane);
      const isTabbar = !!document.elementFromPoint(e.clientX, e.clientY)?.closest(".tabbar");
      const r = el.getBoundingClientRect();
      const effectiveRect = { left: r.left, top: r.top, width: r.width, height: r.height };

      // When dragging from the bottom/docked panel, the panel will close on drop,
      // so expand the preview rectangle to show the full final layout of the pane.
      if (fromPane === -1 || path === "__panel_term__") {
        const panelEl = document.querySelector(".panel:not([hidden])") as HTMLElement | null;
        if (panelEl) {
          const pr = panelEl.getBoundingClientRect();
          if (pr.top >= r.bottom - 8) {
            effectiveRect.height = pr.bottom - r.top;
          } else if (pr.left >= r.right - 8) {
            effectiveRect.width = pr.right - r.left;
          } else if (pr.bottom <= r.top + 8) {
            effectiveRect.top = pr.top;
            effectiveRect.height = r.bottom - pr.top;
          }
        }
      }

      const zone = zoneAt(effectiveRect, e.clientX, e.clientY, isTabbar);
      hit = { pane: paneId, zone };
      mark!.hidden = false;
      const zr = zoneRect(effectiveRect, zone);
      Object.assign(mark!.style, {
        left: `${zr.left}px`,
        top: `${zr.top}px`,
        width: `${zr.width}px`,
        height: `${zr.height}px`,
      });
    } else {
      hit = null;
      mark!.hidden = true;
    }
  };
  const up = () => {
    const was = ghost !== null, h = hit;
    end();
    if (!was) return;
    // The mouseup of a drag would click the row it started on and open the file there.
    const swallow = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallow, true), 0);
    if (h) onDrop(path, h.pane, h.zone, fromPane);
  };
  const key = (e: KeyboardEvent) => { if (e.key === "Escape") { hit = null; end(); } };
  window.addEventListener("mousemove", move, true);
  window.addEventListener("mouseup", up, true);
  window.addEventListener("keydown", key, true);
}
