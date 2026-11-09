// PDF viewer on pdf.js' PDFViewer (ADR-0004), loaded on the first PDF. Keys like a pager:
// j/k scroll, <C-d>/<C-u> half a page, gg/G, J/K next/previous page, + - zoom, 0 page width, 1 100 %, / n N search.
// The measures "pdf:first-page" (K6) and "pdf:find" (K7) go to the performance timeline.
import { registerViewer, type ViewContext, type ViewHandle } from "../core/viewers";
import "./pdf.css";

const LINE = 40; // px per j/k
const ZOOM = 1.1;

const load = () => Promise.all([
  import("pdfjs-dist"),
  import("pdfjs-dist/web/pdf_viewer.mjs"),
  import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  import("pdfjs-dist/web/pdf_viewer.css"),
]);

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
  let task: import("pdfjs-dist").PDFDocumentLoadingTask | null = null;
  let disposed = false, error = "", matches = "", query = "", findStart = 0, lastG = 0;

  const search = (again: boolean, previous = false) => {
    if (!query || !bus) return;
    if (!again) findStart = performance.now();
    bus.dispatch("find", { source: null, type: again ? "again" : "", query, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: previous, matchDiacritics: false });
  };

  load().then(async ([pdfjs, web, worker]) => {
    if (disposed) return;
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    bus = new web.EventBus();
    const links = new web.PDFLinkService({ eventBus: bus, externalLinkTarget: web.LinkTarget.BLANK });
    const finder = new web.PDFFindController({ eventBus: bus, linkService: links });
    viewer = new web.PDFViewer({ container: box as HTMLDivElement, viewer: pages, eventBus: bus, linkService: links, findController: finder });
    links.setViewer(viewer);
    bus.on("pagesinit", () => { viewer!.currentScaleValue = "page-width"; });
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
    // No scripting manager, so JavaScript inside a PDF never runs.
    task = pdfjs.getDocument({ url: ctx.url, enableXfa: false });
    const doc = await task.promise;
    if (disposed) return void task.destroy();
    viewer.setDocument(doc);
    links.setDocument(doc);
  }).catch((e) => {
    error = `can't show this PDF: ${e instanceof Error ? e.message : e}`;
    ctx.onStatus();
  });

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
      viewer?.cleanup();
      box.remove();
      find.remove();
    },
    status: () => error || (viewer?.pagesCount
      ? `page ${viewer.currentPageNumber}/${viewer.pagesCount}  ${Math.round(viewer.currentScale * 100)}%${matches ? "  " + matches : ""}`
      : "loading"),
    reload: () => {}, // shortcut: a PDF changed on disk shows the old version until reopened
  };
}

registerViewer({ id: "pdf", exts: ["pdf"], mount: mountPdf });
