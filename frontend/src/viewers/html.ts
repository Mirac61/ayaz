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

function findBaseElement(html: string): { exists: boolean; href: string | null } {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const baseEl = doc.querySelector("base");
    if (!baseEl) return { exists: false, href: null };
    return { exists: true, href: baseEl.getAttribute("href") };
  }
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const m = withoutComments.match(/<base\b([^>]*)>/i);
  if (!m) return { exists: false, href: null };
  const hrefMatch = m[1].match(/\bhref\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/i);
  return { exists: true, href: hrefMatch ? (hrefMatch[2] ?? hrefMatch[3]) : null };
}

export function prepareHtml(live: string, url: string): string {
  const baseHref = url.slice(0, url.lastIndexOf("/") + 1);
  if (!baseHref) return live;

  const base = findBaseElement(live);

  if (!base.exists) {
    const withoutComments = live.replace(/<!--[\s\S]*?-->/g, "");
    if (/<head\b[^>]*>/i.test(withoutComments)) {
      let replaced = false;
      return live.replace(/<!--[\s\S]*?-->|(<head\b[^>]*>)/gi, (match, headTag) => {
        if (!headTag || replaced) return match;
        replaced = true;
        return `${headTag}<base href="${baseHref}">`;
      });
    }
    return `<base href="${baseHref}">${live}`;
  }

  if (base.href === null) {
    let replaced = false;
    return live.replace(/<!--[\s\S]*?-->|(<base\b[^>]*>)/gi, (match, baseTag) => {
      if (!baseTag || replaced) return match;
      replaced = true;
      return baseTag.replace(/<base\b/i, `$& href="${baseHref}"`);
    });
  }

  const isAbs = /^[a-z][a-z0-9+.-]*:|\/\//i.test(base.href);
  if (!isAbs) {
    const resolved = resolveBaseUrl(base.href, url);
    let replaced = false;
    return live.replace(/<!--[\s\S]*?-->|(<base\b[^>]*>)/gi, (match, baseTag) => {
      if (!baseTag || replaced) return match;
      replaced = true;
      return baseTag.replace(/\bhref\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/i, `href="${resolved}"`);
    });
  }

  return live;
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
