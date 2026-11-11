// Browser viewer for local pages (dev servers): an address bar over an <iframe>. Tab path: "browser://localhost:3000/x".
// A server that isn't up yet gets a waiting screen that retries and offers the dev servers that do answer.
// shortcut: iframe only, so no devtools, no back/forward (a cross-origin frame hides its history), and the tab keeps the URL it was opened with;
// upgrade to a native WKWebView if pages beyond localhost are ever needed.
import { registerViewer, BROWSER, type ViewContext, type ViewHandle } from "../core/viewers";
import "./browser.css";

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);
// Ports dev servers use, scanned when the one asked for is silent.
const DEV_PORTS: [port: number, name: string][] = [
  [3000, "Next, Node"], [3001, "Node"], [4200, "Angular"], [4321, "Astro"], [5000, "Flask"],
  [5173, "Vite"], [8000, "Django, Python"], [8080, "Go, Java"], [8888, "Jupyter"],
];
const RETRY_MS = 2000;
const PROBE_MS = 1200;

// The URL for what was typed ("3000", "localhost:3000/x", "http://127.0.0.1:8080"), null unless it is a local http(s) address.
export function localUrl(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const full = /^https?:\/\//i.test(t) ? t : /^\d+$/.test(t) ? `http://localhost:${t}` : `http://${t}`;
  try {
    const u = new URL(full);
    return LOCAL.has(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

// Whether something answers there. no-cors: any HTTP answer counts, the body stays unreadable; only a refused connection fails.
const answers = (url: string) =>
  fetch(url, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(PROBE_MS) }).then(() => true, () => false);

const el = <T extends HTMLElement = HTMLElement>(tag: string, className: string, props: Partial<T> = {}) =>
  Object.assign(document.createElement(tag), { className }, props) as T;

export function mountBrowser(parent: HTMLElement, ctx: ViewContext): ViewHandle {
  // The box takes the focus, not the iframe: keys in a page never reach the app, so only a click hands the keyboard to the page.
  const box = el<HTMLDivElement>("div", "browser-viewer", { tabIndex: 0 });
  const bar = el("div", "browser-bar");
  // Nerd Font glyphs as CSS content, like the other icon buttons (ui/ui.css).
  const button = (label: string, glyph: string, run: () => void) => {
    const b = el<HTMLButtonElement>("button", "ui-icon", { type: "button", title: label, tabIndex: -1 });
    b.dataset.glyph = glyph;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", run);
    return b;
  };
  const field = el("label", "browser-field");
  field.append(el("span", "browser-lock"));
  const address = el<HTMLInputElement>("input", "", { type: "text", spellcheck: false });
  address.setAttribute("aria-label", "Address");
  field.append(address);
  const progress = el("div", "browser-progress");
  const frame = el<HTMLIFrameElement>("iframe", "", { title: "Browser" });
  // Other ports are other origins, so the page can't reach the app; it keeps its own storage and cookies.
  frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-modals allow-same-origin");
  const waiting = el("div", "browser-waiting");
  waiting.hidden = true;

  let current = "", state: "loading" | "up" | "down" | "invalid" = "loading", gen = 0, timer = 0;
  const show = (s: typeof state) => {
    state = s;
    box.dataset.state = s;
    if (s === "loading") box.dataset.busy = "";
    else if (s !== "up") delete box.dataset.busy;
    waiting.hidden = s !== "down" && s !== "invalid";
    ctx.onStatus();
  };

  // The waiting screen: what is missing, and the servers that do answer, one click away.
  const drawWaiting = (url: string | null, found: [number, string][]) => {
    const host = url ? new URL(url).host : "";
    const title = el("div", "browser-waiting-title", {
      textContent: url ? `Nothing is listening on ${host}` : "Only local addresses work here",
    });
    const hint = el("div", "browser-waiting-hint", {
      textContent: url ? "Start the dev server, this page loads by itself." : "localhost, 127.0.0.1 and [::1]",
    });
    const chips = found.map(([port, name]) => {
      const c = el<HTMLButtonElement>("button", "browser-chip", { type: "button", tabIndex: -1 });
      c.append(el("b", "", { textContent: `:${port}` }), el("span", "", { textContent: name }));
      c.addEventListener("click", () => load(`localhost:${port}`));
      return c;
    });
    waiting.replaceChildren(el("span", "browser-waiting-icon"), title, hint,
      ...(chips.length ? [el("div", "browser-waiting-label", { textContent: "Running now" }), el("div", "browser-chips")] : []));
    waiting.querySelector(".browser-chips")?.append(...chips);
  };

  const scan = async (host: string, mine: string) => {
    const hits = await Promise.all(DEV_PORTS.map(async ([port, name]) => (await answers(`http://${host}:${port}/`)) ? [port, name] as [number, string] : null));
    return hits.filter((h): h is [number, string] => !!h && `${h[0]}` !== mine);
  };

  async function load(text: string) {
    clearTimeout(timer);
    const my = ++gen;
    const url = localUrl(text);
    if (!url) {
      drawWaiting(null, []);
      return show("invalid");
    }
    current = url;
    address.value = url;
    show("loading");
    if (await answers(url)) {
      if (my !== gen) return;
      show("up");
      box.dataset.busy = "";
      frame.src = url;
      return;
    }
    if (my !== gen) return;
    const u = new URL(url);
    drawWaiting(url, await scan(u.hostname, u.port));
    if (my !== gen) return;
    show("down");
    timer = window.setTimeout(() => void load(url), RETRY_MS);
  }

  const reload = () => void load(current || address.value);
  bar.append(button("Reload", "", reload), field,
    button("Open in the system browser", "", () => { if (current) ctx.openURL?.(current); }));
  address.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { void load(address.value); box.focus(); }
    else if (e.key === "Escape") { address.value = current; box.focus(); }
    e.stopPropagation();
  });
  address.addEventListener("focus", () => address.select());
  frame.addEventListener("load", () => delete box.dataset.busy);
  box.append(bar, progress, frame, waiting);
  parent.append(box);
  void load(ctx.url);

  return {
    focus: () => (state === "down" || state === "invalid" ? address.focus() : box.focus()),
    dispose: () => { gen++; clearTimeout(timer); box.remove(); },
    status: () => (state === "invalid" ? "only local addresses" : state === "down" ? "waiting for the server" : current),
    reload,
  };
}

registerViewer({ id: "browser", exts: [], scheme: BROWSER, mount: mountBrowser });
