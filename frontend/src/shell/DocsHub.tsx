import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { BookOpen, Search, ArrowLeft, ArrowRight, Menu, PanelRightClose, PanelRightOpen, Sun, Moon } from "lucide-react";
import { DOC_ITEMS, matchDoc, type DocItem } from "../docs/docsData";
import { backend } from "../core/backend";
import { browsable } from "../editor/mdlive";
import "./docsHub.css";

export interface DocsHubProps {
  initialDocId?: string;
  onClose(): void;
}

interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

const SCROLL_OFFSET = 28;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function filterDuplicateToc(content: string): string {
  return content.replace(/^##\s+Contents\b[^\n]*\n[\s\S]*?(?=(?:^##\s)|(?![\s\S]))/m, "");
}

function sanitizeHtml(html: string): string {
  if (typeof DOMPurify?.sanitize === "function") {
    return DOMPurify.sanitize(html, { ADD_ATTR: ["id", "tabindex"] });
  }
  if (typeof window !== "undefined" && typeof (DOMPurify as any)(window)?.sanitize === "function") {
    return (DOMPurify as any)(window).sanitize(html, { ADD_ATTR: ["id", "tabindex"] });
  }
  return html;
}

function extractSnippet(content: string, query: string): string | null {
  if (!query) return null;
  const lower = content.toLowerCase();
  const q = query.toLowerCase();
  const index = lower.indexOf(q);
  if (index === -1) return null;

  const start = Math.max(0, index - 25);
  const end = Math.min(content.length, index + query.length + 55);
  let snippet = content
    .slice(start, end)
    .replace(/[\r\n#*`|]+/g, " ")
    .trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < content.length) snippet = `${snippet}…`;
  return snippet;
}

const HighlightedText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "i");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="docs-search-highlight">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
};

export const DocsHub: React.FC<DocsHubProps> = ({ initialDocId, onClose }) => {
  const isMac = typeof navigator !== "undefined" && (/Mac/i.test(navigator.platform) || /Macintosh/i.test(navigator.userAgent));

  const [selectedId, setSelectedId] = useState<string>(initialDocId || DOC_ITEMS[0].id);
  const [search, setSearch] = useState("");
  const [activeHeadingId, setActiveHeadingId] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(true);
  const [isLight, setIsLight] = useState<boolean>(() => {
    try {
      if (typeof localStorage !== "undefined") {
        return localStorage.getItem("ayaz_docs_theme") === "light";
      }
    } catch {
      // storage unavailable / blocked
    }
    return false;
  });

  const toggleLight = () => {
    const next = !isLight;
    setIsLight(next);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("ayaz_docs_theme", next ? "light" : "dark");
      }
    } catch {
      // ignore storage errors without interrupting theme toggle
    }
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const tocRef = useRef<HTMLElement>(null);
  const lastGTimeRef = useRef<number>(0);
  const isScrollSpyLockedRef = useRef<boolean>(false);
  const spyLockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (spyLockTimerRef.current !== null) {
        window.clearTimeout(spyLockTimerRef.current);
      }
    };
  }, []);

  // Filter docs and extract snippets
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return DOC_ITEMS.map((doc) => ({
        doc,
        snippet: null as string | null,
      }));
    }
    return DOC_ITEMS.filter((d) => matchDoc(d, q)).map((doc) => ({
      doc,
      snippet: extractSnippet(doc.content, q),
    }));
  }, [search]);

  const filteredDocs = useMemo(() => searchResults.map((r) => r.doc), [searchResults]);

  // Keep selected document in sync
  const currentDoc = useMemo(() => {
    const found = filteredDocs.find((d) => d.id === selectedId);
    return found || filteredDocs[0] || null;
  }, [filteredDocs, selectedId]);

  // Group by category preserving logical order
  const categories = useMemo(() => {
    const map = new Map<string, { doc: DocItem; snippet: string | null }[]>();
    for (const res of searchResults) {
      const list = map.get(res.doc.category) ?? [];
      list.push(res);
      map.set(res.doc.category, list);
    }
    return map;
  }, [searchResults]);

  // Render markdown and generate table of contents
  const { renderedHtml, tocHeadings } = useMemo(() => {
    if (!currentDoc) return { renderedHtml: "", tocHeadings: [] };

    const headings: TocHeading[] = [];
    const slugCounts = new Map<string, number>();

    const localMd = new MarkdownIt({ html: true, linkify: true });

    localMd.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
      const token = tokens[idx];
      const next = tokens[idx + 1];
      const text = next && next.type === "inline" ? next.content : "";
      const slug = slugify(text) || "section";
      const count = slugCounts.get(slug) || 0;
      slugCounts.set(slug, count + 1);
      const id = count === 0 ? slug : `${slug}-${count}`;
      token.attrSet("id", id);

      if (token.tag === "h2" || token.tag === "h3") {
        headings.push({
          id,
          text,
          level: token.tag === "h2" ? 2 : 3,
        });
      }

      const tagOpen = self.renderToken(tokens, idx, options);
      if (token.tag === "h2" || token.tag === "h3") {
        return `${tagOpen}<a href="#${id}" class="docs-heading-anchor" aria-label="Permalink to ${text.replace(/"/g, "&quot;")}" tabindex="-1">#</a>`;
      }
      return tagOpen;
    };

    const cleanContent = filterDuplicateToc(currentDoc.content);
    const raw = localMd.render(cleanContent);
    return {
      renderedHtml: sanitizeHtml(raw),
      tocHeadings: headings,
    };
  }, [currentDoc]);

  // Doc change: scroll to top, focus content container, update active TOC heading
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
      if (typeof document !== "undefined" && document.activeElement !== inputRef.current) {
        contentRef.current.focus({ preventScroll: true });
      }
    }
    if (tocHeadings.length > 0) {
      setActiveHeadingId(tocHeadings[0].id);
    } else {
      setActiveHeadingId("");
    }
  }, [currentDoc?.id, tocHeadings]);

  // Scroll spy for TOC
  useEffect(() => {
    const container = contentRef.current;
    if (!container || tocHeadings.length === 0) return;

    let ticking = false;
    const handleScroll = () => {
      if (isScrollSpyLockedRef.current) return;
      const headings = Array.from(container.querySelectorAll<HTMLElement>("h2[id], h3[id]"));
      if (headings.length === 0) return;

      const containerTop = container.getBoundingClientRect().top;
      let currentActive = headings[0].id;

      for (const h of headings) {
        const topOffset = h.getBoundingClientRect().top - containerTop;
        if (topOffset <= SCROLL_OFFSET) {
          currentActive = h.id;
        } else {
          break;
        }
      }
      setActiveHeadingId(currentActive);
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, [tocHeadings]);

  // Keep active TOC entry visible without scrolling TOC if already visible
  useEffect(() => {
    if (!activeHeadingId || !tocRef.current) return;
    const activeLink = tocRef.current.querySelector<HTMLElement>(`a.docs-toc-link[href="#${activeHeadingId}"]`);
    if (activeLink) {
      activeLink.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeHeadingId]);

  // Previous and next documentation items
  const currentDocIndex = useMemo(() => {
    return filteredDocs.findIndex((d) => d.id === currentDoc?.id);
  }, [filteredDocs, currentDoc]);

  const prevDoc = currentDocIndex > 0 ? filteredDocs[currentDocIndex - 1] : null;
  const nextDoc = currentDocIndex >= 0 && currentDocIndex < filteredDocs.length - 1 ? filteredDocs[currentDocIndex + 1] : null;

  const triggerScrollSpyLock = (id: string) => {
    setActiveHeadingId(id);
    isScrollSpyLockedRef.current = true;
    if (spyLockTimerRef.current !== null) {
      window.clearTimeout(spyLockTimerRef.current);
    }
    spyLockTimerRef.current = window.setTimeout(() => {
      isScrollSpyLockedRef.current = false;
      spyLockTimerRef.current = null;
    }, 350);
  };

  // Jump to TOC anchor smoothly
  const handleTocClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id;
    const el = contentRef.current?.querySelector(`#${escaped}`);
    if (el) {
      const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      triggerScrollSpyLock(id);

      el.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  // Jump to anchor link or open external URL when clicked inside markdown content
  const handleContentClick = (e: React.MouseEvent<HTMLElement>) => {
    const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>("a");
    if (!anchor) return;
    e.preventDefault();
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      const id = decodeURIComponent(href.slice(1));
      const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id;
      const el = contentRef.current?.querySelector(`#${escaped}`);
      if (el) {
        const prefersReducedMotion =
          typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        triggerScrollSpyLock(id);

        el.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      }
    } else if (browsable(href)) {
      void backend.openURL(href);
    }
  };

  // Central keyboard management
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isInput = document.activeElement === inputRef.current;
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scrollBehavior = prefersReducedMotion ? "auto" : "smooth";

    // ⌘K or Ctrl+K anywhere: focus search
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    if (isInput) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filteredDocs.length > 0) {
          const curIdx = filteredDocs.findIndex((d) => d.id === currentDoc?.id);
          const nextIdx = (curIdx + 1) % filteredDocs.length;
          setSelectedId(filteredDocs[nextIdx].id);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filteredDocs.length > 0) {
          const curIdx = filteredDocs.findIndex((d) => d.id === currentDoc?.id);
          const prevIdx = (curIdx - 1 + filteredDocs.length) % filteredDocs.length;
          setSelectedId(filteredDocs[prevIdx].id);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        inputRef.current?.blur();
        contentRef.current?.focus({ preventScroll: true });
      } else if (e.key === "Escape") {
        if (search.trim()) {
          e.preventDefault();
          setSearch("");
        }
      }
      return;
    }

    // Keyboard controls when reading
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "/") {
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      contentRef.current?.scrollBy({ top: 80, behavior: scrollBehavior });
      return;
    }

    if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      contentRef.current?.scrollBy({ top: -80, behavior: scrollBehavior });
      return;
    }

    if (e.key === "g") {
      const now = Date.now();
      if (now - lastGTimeRef.current < 450) {
        e.preventDefault();
        contentRef.current?.scrollTo({ top: 0, behavior: scrollBehavior });
        lastGTimeRef.current = 0;
      } else {
        lastGTimeRef.current = now;
      }
      return;
    }
  };

  const selectDoc = (id: string) => {
    setSelectedId(id);
    setMobileMenuOpen(false);
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="docs-backdrop">
          <Dialog.Content
            className={`docs-container ${isMac ? "is-mac" : ""} ${isLight ? "light" : ""}`}
            onKeyDown={handleKeyDown}
            onEscapeKeyDown={(e) => {
              if (document.activeElement === inputRef.current && search.trim()) {
                e.preventDefault();
                setSearch("");
              }
            }}
            aria-describedby={undefined}
          >
            {/* Top Command Bar */}
            <header className="docs-header">
              <div className="docs-brand-group">
                <button
                  type="button"
                  className="docs-mobile-toggle"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Toggle navigation drawer"
                >
                  <Menu size={14} />
                </button>

                <button type="button" className="docs-back-btn" onClick={onClose} aria-label="Back (Esc)" title="Back (Esc)">
                  <ArrowLeft size={13} />
                  <span className="docs-back-label">Back</span>
                </button>

                <span className="docs-brand-sep" aria-hidden="true">
                  |
                </span>

                <div className="docs-brand">
                  <BookOpen size={13} className="docs-brand-icon" />
                  <Dialog.Title className="docs-brand-title">Ayaz Docs</Dialog.Title>
                </div>
              </div>

              {/* Command Search Bar */}
              <div className="docs-search-wrap">
                <Search size={12} className="docs-search-icon" />
                <input
                  ref={inputRef}
                  type="text"
                  className="docs-search-input"
                  placeholder="Search documentation, commands & keys..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  spellCheck={false}
                  aria-label="Search documentation"
                />
                <div className="docs-search-meta">
                  <span className="docs-search-count">
                    {search.trim()
                      ? `${filteredDocs.length} ${filteredDocs.length === 1 ? "match" : "matches"}`
                      : `${DOC_ITEMS.length} docs`}
                  </span>
                  <kbd className="docs-search-kbd">⌘K</kbd>
                </div>
              </div>

              {/* Tools (Theme & TOC) */}
              <div className="docs-header-actions">
                <button
                  type="button"
                  className="docs-tool-btn"
                  onClick={toggleLight}
                  title={isLight ? "Switch to dark mode" : "Switch to light mode"}
                  aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
                >
                  {isLight ? <Moon size={13} /> : <Sun size={13} />}
                </button>

                <button
                  type="button"
                  className={`docs-tool-btn ${tocOpen ? "active" : ""}`}
                  onClick={() => setTocOpen(!tocOpen)}
                  title={tocOpen ? "Collapse 'On this page' (TOC)" : "Expand 'On this page' (TOC)"}
                  aria-label={tocOpen ? "Collapse 'On this page' (TOC)" : "Expand 'On this page' (TOC)"}
                >
                  {tocOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
                </button>
              </div>
            </header>

            {/* 3-Zone Documentation Layout */}
            <div className="docs-body">
              {mobileMenuOpen && (
                <div className="docs-mobile-backdrop" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
              )}

              {/* Zone 1: Sidebar Navigation */}
              <nav className={`docs-sidebar ${mobileMenuOpen ? "open" : ""}`} aria-label="Documentation Categories">
                {Array.from(categories.entries()).map(([cat, items]) => (
                  <div key={cat} className="docs-category">
                    <div className="docs-category-title">{cat}</div>
                    <div className="docs-category-items">
                      {items.map(({ doc, snippet }) => {
                        const Icon = doc.icon;
                        const active = currentDoc?.id === doc.id;
                        return (
                          <button
                            key={doc.id}
                            type="button"
                            className={`docs-nav-item ${active ? "active" : ""}`}
                            onClick={() => selectDoc(doc.id)}
                            aria-current={active ? "page" : undefined}
                          >
                            <div className="docs-nav-item-header">
                              <Icon size={14} className="docs-nav-icon" />
                              <span className="docs-nav-title">
                                <HighlightedText text={doc.title} query={search} />
                              </span>
                            </div>
                            {snippet && (
                              <div className="docs-nav-snippet">
                                <HighlightedText text={snippet} query={search} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              {/* Zone 2: Centered Content Column */}
              <main
                ref={contentRef}
                className="docs-content"
                role="region"
                aria-label={currentDoc ? currentDoc.title : "Documentation content"}
                tabIndex={-1}
                onClick={handleContentClick}
              >
                <div className="docs-content-inner">
                  {currentDoc ? (
                    <>
                      <article className="docs-markdown" dangerouslySetInnerHTML={{ __html: renderedHtml }} />

                      {/* Previous / Next Article Navigation */}
                      <footer className="docs-pagination" aria-label="Article navigation">
                        {prevDoc ? (
                          <button type="button" className="docs-pagination-btn prev" onClick={() => selectDoc(prevDoc.id)}>
                            <span className="docs-pagination-label">
                              <ArrowLeft size={12} />
                              Previous
                            </span>
                            <span className="docs-pagination-title">{prevDoc.title}</span>
                          </button>
                        ) : (
                          <div className="docs-pagination-spacer" />
                        )}

                        {nextDoc && (
                          <button type="button" className="docs-pagination-btn next" onClick={() => selectDoc(nextDoc.id)}>
                            <span className="docs-pagination-label">
                              Next
                              <ArrowRight size={12} />
                            </span>
                            <span className="docs-pagination-title">{nextDoc.title}</span>
                          </button>
                        )}
                      </footer>
                    </>
                  ) : (
                    <div className="docs-empty-search">
                      <div className="docs-empty-title">No matching documentation</div>
                      <div className="docs-empty-desc">
                        No articles matching &quot;{search}&quot;. Try different keywords or press Esc to reset.
                      </div>
                    </div>
                  )}
                </div>
              </main>

              {/* Zone 3: On This Page Table of Contents */}
              <aside ref={tocRef} className={`docs-toc ${tocOpen ? "" : "collapsed"}`} aria-label="Table of contents">
                <div className="docs-toc-header">On this page</div>
                {tocHeadings.length > 0 ? (
                  <nav className="docs-toc-list">
                    {tocHeadings.map((h) => {
                      const isActive = activeHeadingId === h.id;
                      return (
                        <a
                          key={h.id}
                          href={`#${h.id}`}
                          title={h.text}
                          className={`docs-toc-link level-${h.level} ${isActive ? "active" : ""}`}
                          onClick={(e) => handleTocClick(e, h.id)}
                          tabIndex={0}
                        >
                          {h.text}
                        </a>
                      );
                    })}
                  </nav>
                ) : (
                  <div className="docs-toc-empty">No subheadings</div>
                )}
              </aside>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
