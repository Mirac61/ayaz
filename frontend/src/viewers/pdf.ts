// PDF viewer on pdf.js' PDFViewer (ADR-0004), loaded on the first PDF. Keys like a pager:
// j/k scroll, <C-d>/<C-u> half a page, gg/G, J/K next/previous page, + - zoom, 0 page width, 1 100 %, / n N search.
// The measures "pdf:first-page" (K6) and "pdf:find" (K7) go to the performance timeline.
import { registerViewer, type ViewContext, type ViewHandle } from "../core/viewers";
import "./pdf.css";

const LINE = 40; // px per j/k
const ZOOM = 1.1;

// pdf_viewer.mjs reads globalThis.pdfjsLib, which pdfjs-dist sets when it loads, so the core must load first.
const load = async () => {
  const pdfjs = await import("pdfjs-dist");
  return Promise.all([pdfjs, import("pdfjs-dist/web/pdf_viewer.mjs"), import("pdfjs-dist/build/pdf.worker.min.mjs?url"), import("./pdfRender"), import("pdfjs-dist/web/pdf_viewer.css")]);
};

export function mountPdf(el: HTMLElement, ctx: ViewContext): ViewHandle {
  const t0 = performance.now();
  const box = document.createElement("div");
  box.className = "pdf-viewer";
  box.tabIndex = 0;
  box.setAttribute("role", "document");
  const pages = document.createElement("div");
  pages.className = "pdfViewer";
  box.append(pages);
  const find = document.createElement("input");
  find.className = "pdf-find";
  find.setAttribute("aria-label", "Search in PDF");
  find.hidden = true;
  el.append(box, find);

  let viewer: import("pdfjs-dist/web/pdf_viewer.mjs").PDFViewer | null = null;
  let bus: import("pdfjs-dist/web/pdf_viewer.mjs").EventBus | null = null;
  let task: import("pdfjs-dist").PDFDocumentLoadingTask | null = null; // the newest load
  let shown: import("pdfjs-dist").PDFDocumentLoadingTask | null = null; // the document on screen
  let open: ((url: string) => Promise<void>) | undefined; // set once pdf.js has loaded
  let renderer: import("./pdfRender").Renderer | null = null;
  let keep: { page: number; scale: string } | null = null; // page and zoom to restore after a reload
  let disposed = false, error = "", matches = "", query = "", findStart = 0, lastG = 0;
  const fail = (e: unknown) => {
    error = `can't show this PDF: ${e instanceof Error ? e.message : e}`;
    ctx.onStatus();
  };

  const search = (again: boolean, previous = false) => {
    if (!query || !bus) return;
    if (!again) findStart = performance.now();
    bus.dispatch("find", { source: null, type: again ? "again" : "", query, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: previous, matchDiacritics: false });
  };

  load().then(async ([pdfjs, web, worker, { createRenderer, renderTask }]) => {
    if (disposed) return;
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const r = (renderer = createRenderer());
    // Page canvases are drawn by the render worker (S8), so scrolling keeps the main thread free.
    bus = new web.EventBus();
    const links = new web.PDFLinkService({ eventBus: bus, externalLinkTarget: web.LinkTarget.BLANK });
    const finder = new web.PDFFindController({ eventBus: bus, linkService: links });
    // maxCanvasPixels: pdf.js' mobile cap. The 10 pages it keeps render at low resolution, only the visible part sharp on top;
    // at full Retina resolution each page canvas took ~30 MB and K8 went to +477 MB.
    viewer = new web.PDFViewer({ container: box as HTMLDivElement, viewer: pages, eventBus: bus, linkService: links, findController: finder, maxCanvasPixels: 5242880 });
    links.setViewer(viewer);
    // Like Chrome and Preview: while scrolling, pages show their low-resolution canvas and the sharp detail canvas follows
    // 100 ms after the scroll stops. Redrawing it every other frame missed frames at 120 Hz (perf-log).
    let scrolling = 0;
    box.addEventListener("scroll", () => {
      clearTimeout(scrolling);
      scrolling = window.setTimeout(() => ((scrolling = 0), !disposed && viewer?.update()), 100);
    });
    const queue = viewer.renderingQueue!, pick = queue.getHighestPriority.bind(queue);
    queue.getHighestPriority = (visible, views, down, extra, ignoreDetail) =>
      pick(visible, views, down, extra, ignoreDetail || scrolling !== 0);
    bus.on("pagesinit", () => {
      viewer!.currentScaleValue = keep?.scale ?? "page-width";
      if (keep) viewer!.currentPageNumber = Math.min(keep.page, viewer!.pagesCount);
    });
    bus.on("pagerendered", (e: { pageNumber: number }) => {
      if (e.pageNumber === 1 && !performance.getEntriesByName("pdf:first-page").length) performance.measure("pdf:first-page", { start: t0 });
    });
    bus.on("updatefindmatchescount", (e: { matchesCount: { current: number; total: number } }) => {
      matches = e.matchesCount.total ? `${e.matchesCount.current}/${e.matchesCount.total} matches` : "";
      ctx.onStatus();
    });
    bus.on("updatefindcontrolstate", (e: { state: number; matchesCount: { total: number } }) => {
      if (e.state === web.FindState.NOT_FOUND) matches = `no match for "${query}"`;
      if (e.state !== web.FindState.PENDING && findStart) {
        performance.measure("pdf:find", { start: findStart });
        findStart = 0;
      }
      ctx.onStatus();
    });
    for (const ev of ["pagechanging", "scalechanging"]) bus.on(ev, () => ctx.onStatus());
    // No scripting manager, so JavaScript inside a PDF never runs. A newer load wins over one still running.
    open = async (url) => {
      const t = (task = pdfjs.getDocument({ url, enableXfa: false }));
      const doc = await t.promise;
      if (disposed || t !== task) return void t.destroy();
      // The worker opens the file only now, so renders of the old document that are still queued get cancelled, not drawn with the new one.
      r.open(url).catch(() => {});
      const getPage = doc.getPage.bind(doc);
      doc.getPage = async (n) => {
        const page = await getPage(n); // pdf.js caches the proxy, so this sets the same render again
        page.render = (p) => renderTask(r, n, p);
        return page;
      };
      viewer!.setDocument(doc);
      links.setDocument(doc);
      void shown?.destroy();
      shown = t;
      error = "";
    };
    await open(ctx.url);
  }).catch(fail);

  // Links leave through the system browser, never inside the app.
  box.addEventListener("click", (e) => {
    const a = (e.target as Element).closest("a");
    const href = a?.getAttribute("href");
    if (!a || !href || href.startsWith("#")) return;
    e.preventDefault();
    e.stopPropagation();
    ctx.openURL?.(a.href);
  }, true);

  const scroll = (dy: number) => box.scrollBy({ top: dy });
  const zoom = (f: number) => { if (viewer) viewer.currentScale = Math.min(10, Math.max(0.1, viewer.currentScale * f)); };
  const keys: Record<string, () => void> = {
    j: () => scroll(LINE), k: () => scroll(-LINE),
    J: () => viewer?.nextPage(), K: () => viewer?.previousPage(),
    G: () => viewer && (viewer.currentPageNumber = viewer.pagesCount),
    "+": () => zoom(ZOOM), "=": () => zoom(ZOOM), "-": () => zoom(1 / ZOOM),
    "0": () => viewer && (viewer.currentScaleValue = "page-width"), "1": () => viewer && (viewer.currentScaleValue = "1"),
    "/": () => { find.hidden = false; find.value = query; find.select(); find.focus(); },
    n: () => search(true), N: () => search(true, true),
  };
  box.addEventListener("keydown", (e) => {
    let f: (() => void) | undefined;
    if (e.ctrlKey && !e.metaKey && !e.altKey) f = { d: () => scroll(box.clientHeight / 2), u: () => scroll(-box.clientHeight / 2) }[e.key];
    else if (!e.metaKey && !e.altKey) {
      if (e.key === "g") { // gg: two within a second
        const now = Date.now(), second = now - lastG < 1000;
        lastG = second ? 0 : now;
        f = second ? () => box.scrollTo({ top: 0 }) : () => {};
      } else f = keys[e.key];
    }
    if (!f) return;
    e.preventDefault();
    f();
  });
  find.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { query = find.value; search(false); }
    else if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    find.hidden = true;
    box.focus();
  });

  return {
    focus: () => box.focus(),
    dispose: () => {
      disposed = true;
      void task?.destroy();
      void shown?.destroy();
      renderer?.dispose();
      viewer?.cleanup();
      box.remove();
      find.remove();
    },
    status: () => error || (viewer?.pagesCount
      ? `page ${viewer.currentPageNumber}/${viewer.pagesCount}  ${Math.round(viewer.currentScale * 100)}%${matches ? "  " + matches : ""}`
      : "loading"),
    // A file caught halfway through being written fails to load and keeps the old one; its next change loads it again.
    reload: () => {
      if (viewer?.pagesCount) keep = { page: viewer.currentPageNumber, scale: viewer.currentScaleValue };
      matches = "";
      open?.(`${ctx.url}?t=${Date.now()}`).catch(fail); // ?t=: past the HTTP cache, like the image viewer
    },
  };
}

registerViewer({ id: "pdf", exts: ["pdf"], mount: mountPdf });
