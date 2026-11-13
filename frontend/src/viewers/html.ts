// HTML preview iframe: live preview for .html and .htm files in a split.
// Tab path: "preview://path/to/file.html".
import { registerViewer, PREVIEW, type ViewContext, type ViewHandle } from "../core/viewers";
import "./html.css";

const el = <T extends HTMLElement = HTMLElement>(tag: string, className: string, props: Partial<T> = {}) =>
  Object.assign(document.createElement(tag), { className }, props) as T;

export function mountHtml(parent: HTMLElement, ctx: ViewContext): ViewHandle {
  const box = el<HTMLDivElement>("div", "html-preview", { tabIndex: 0 });
  const bar = el("div", "html-preview-bar");

  const button = (label: string, glyph: string, run: () => void) => {
    const b = el<HTMLButtonElement>("button", "ui-icon", { type: "button", title: label, tabIndex: -1 });
    b.dataset.glyph = glyph;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", run);
    return b;
  };

  const titleText = decodeURIComponent(ctx.url.slice(ctx.url.lastIndexOf("/") + 1));
  const title = el("div", "html-preview-title", { textContent: `Preview: ${titleText}` });

  const frame = el<HTMLIFrameElement>("iframe", "html-preview-frame", { title: `Preview: ${titleText}` });
  frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-modals allow-same-origin");

  const render = () => {
    const live = ctx.getContent?.();
    if (live !== null && live !== undefined) {
      frame.srcdoc = live;
    } else {
      frame.src = `${ctx.url}${ctx.url.includes("?") ? "&" : "?"}t=${Date.now()}`;
    }
    ctx.onStatus();
  };

  bar.append(
    button("Reload", "", render),
    title,
    button("Open in system browser", "", () => {
      if (ctx.openURL) ctx.openURL(ctx.url);
    })
  );

  box.append(bar, frame);
  parent.append(box);
  render();

  return {
    focus: () => frame.focus(),
    dispose: () => box.remove(),
    status: () => `preview: ${titleText}`,
    reload: render,
  };
}

registerViewer({ id: "html-preview", exts: [], scheme: PREVIEW, mount: mountHtml });
