// Image viewer: fit or 100 %, zoom with + - 0 1, pan with h j k l. GIFs animate and SVGs stay inert, both through <img>.
import { registerViewer, type ViewContext, type ViewHandle } from "../core/viewers";
import "./image.css";

const STEP = 1.25;
const PAN = 0.1; // share of the pane per h/j/k/l
const MIN = 0.02, MAX = 32;

export function mountImage(el: HTMLElement, ctx: ViewContext): ViewHandle {
  const box = document.createElement("div");
  box.className = "image-viewer";
  box.tabIndex = 0;
  box.setAttribute("role", "img");
  const img = document.createElement("img");
  img.draggable = false;
  img.alt = decodeURIComponent(ctx.url.slice(ctx.url.lastIndexOf("/") + 1));
  box.setAttribute("aria-label", img.alt);
  box.append(img);
  el.append(box);

  let fit = true, scale = 1, x = 0, y = 0, failed = false;
  const size = () => ({ w: img.naturalWidth || 300, h: img.naturalHeight || 150 }); // SVG without a size: like a browser
  const fitScale = () => {
    const { w, h } = size();
    return Math.min(1, box.clientWidth / w, box.clientHeight / h) || 1;
  };
  // Keeps the image centered when smaller than the pane, else clamps the pan so no empty space shows.
  const layout = () => {
    if (fit) scale = fitScale();
    const { w, h } = size();
    const sw = w * scale, sh = h * scale, bw = box.clientWidth, bh = box.clientHeight;
    x = sw <= bw ? (bw - sw) / 2 : Math.min(0, Math.max(bw - sw, x));
    y = sh <= bh ? (bh - sh) / 2 : Math.min(0, Math.max(bh - sh, y));
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    ctx.onStatus();
  };
  // Zooms around the pane's center.
  const zoom = (s: number) => {
    const next = Math.min(MAX, Math.max(MIN, s));
    const cx = box.clientWidth / 2, cy = box.clientHeight / 2;
    x = cx - ((cx - x) * next) / scale;
    y = cy - ((cy - y) * next) / scale;
    scale = next;
    fit = false;
    layout();
  };
  const keys: Record<string, () => void> = {
    "+": () => zoom(scale * STEP), "=": () => zoom(scale * STEP), "-": () => zoom(scale / STEP),
    "0": () => { fit = true; layout(); }, "1": () => zoom(1),
    h: () => { x += box.clientWidth * PAN; layout(); }, l: () => { x -= box.clientWidth * PAN; layout(); },
    k: () => { y += box.clientHeight * PAN; layout(); }, j: () => { y -= box.clientHeight * PAN; layout(); },
  };
  box.addEventListener("keydown", (e) => {
    const f = !e.ctrlKey && !e.metaKey && !e.altKey && keys[e.key];
    if (!f) return;
    e.preventDefault();
    f();
  });
  img.addEventListener("load", () => { failed = false; layout(); });
  img.addEventListener("error", () => { failed = true; ctx.onStatus(); });
  const ro = new ResizeObserver(() => layout());
  ro.observe(box);

  const loadSource = () => {
    const live = ctx.getContent?.();
    if (live && (ctx.url.endsWith(".svg") || ctx.url.includes(".svg"))) {
      img.src = `data:image/svg+xml;utf8,${encodeURIComponent(live)}`;
    } else {
      img.src = `${ctx.url}${ctx.url.includes("?") ? "&" : "?"}t=${Date.now()}`;
    }
  };

  const initialLive = ctx.getContent?.();
  if (initialLive && (ctx.url.endsWith(".svg") || ctx.url.includes(".svg"))) {
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(initialLive)}`;
  } else {
    img.src = ctx.url;
  }

  return {
    focus: () => box.focus(),
    dispose: () => { ro.disconnect(); box.remove(); },
    status: () => (failed ? "can't show this image" : img.naturalWidth ? `${Math.round(scale * 100)}%${fit ? " fit" : ""}  ${img.naturalWidth}×${img.naturalHeight}` : ""),
    reload: loadSource,
  };
}

registerViewer({ id: "image", exts: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"], mount: mountImage });
