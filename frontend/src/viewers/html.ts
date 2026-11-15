// HTML preview iframe: live preview for .html and .htm files in a split.
// Tab path: "preview://path/to/file.html".
import { registerViewer, PREVIEW, type ViewContext, type ViewHandle } from "../core/viewers";
import "./html.css";

const el = <T extends HTMLElement = HTMLElement>(tag: string, className: string, props: Partial<T> = {}) =>
  Object.assign(document.createElement(tag), { className }, props) as T;

export function resolveBaseUrl(href: string, base: string): string {
  try {
    const hrefIsAbs = /^[a-z][a-z0-9+.-]*:|\/\//i.test(href);
    if (hrefIsAbs) return href;
    const baseIsAbs = /^[a-z][a-z0-9+.-]*:/i.test(base);
    const u = new URL(href, baseIsAbs ? base : new URL(base, "http://ayaz.local"));
    return baseIsAbs ? u.href : (u.pathname + u.search + u.hash);
  } catch {
    return href;
  }
}

// Points relative URLs at the file's folder. Works on the parsed document, not the source text,
// so the base lands in the real <head> and markup-like text inside scripts or comments stays untouched.
export function prepareHtml(live: string, url: string): string {
  const dir = url.slice(0, url.lastIndexOf("/") + 1);
  if (!dir) return live;
  const doc = new DOMParser().parseFromString(live, "text/html");
  const base = doc.querySelector("base[href]"); // the one the browser uses
  if (base) base.setAttribute("href", resolveBaseUrl(base.getAttribute("href") ?? "", url));
  else {
    const b = doc.createElement("base");
    b.setAttribute("href", dir);
    doc.head.prepend(b);
  }
  const xml = new XMLSerializer(); // for the doctype and comments outside <html>
  return Array.from(doc.childNodes, (n) => (n instanceof Element ? n.outerHTML : xml.serializeToString(n))).join("");
}

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
  const badge = el("span", "html-preview-badge", { textContent: "Browser" });
  const title = el("div", "html-preview-title", { textContent: `Preview: ${titleText}` });

  const frame = el<HTMLIFrameElement>("iframe", "html-preview-frame", { title: `Preview: ${titleText}` });
  frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-modals");

  const render = () => {
    const live = ctx.getContent?.();
    if (live !== null && live !== undefined) {
      frame.srcdoc = prepareHtml(live, ctx.url);
    } else {
      frame.src = `${ctx.url}${ctx.url.includes("?") ? "&" : "?"}t=${Date.now()}`;
    }
    ctx.onStatus();
  };

  bar.append(
    button("Reload", "", render),
    badge,
    title,
    button("Open in system browser", "", () => {
      if (ctx.openURL && (ctx.url.startsWith("http://") || ctx.url.startsWith("https://"))) {
        ctx.openURL(ctx.url);
      }
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
