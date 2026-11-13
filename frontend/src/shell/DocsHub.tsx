import React, { useEffect, useMemo, useRef, useState } from "react";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { DOC_ITEMS, type DocItem } from "../docs/docsData";
import "./docsHub.css";

export interface DocsHubProps {
  initialDocId?: string;
  onClose(): void;
}

const md = new MarkdownIt({ html: true, linkify: true });

function sanitizeHtml(html: string): string {
  if (typeof DOMPurify?.sanitize === "function") {
    return DOMPurify.sanitize(html);
  }
  if (typeof window !== "undefined" && typeof (DOMPurify as any)(window)?.sanitize === "function") {
    return (DOMPurify as any)(window).sanitize(html);
  }
  return html;
}

export const DocsHub: React.FC<DocsHubProps> = ({ initialDocId, onClose }) => {
  const [selectedId, setSelectedId] = useState<string>(initialDocId || DOC_ITEMS[0].id);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Filter docs according to query
  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return DOC_ITEMS;
    return DOC_ITEMS.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q),
    );
  }, [search]);

  // Keep selected document in sync
  const currentDoc = useMemo(() => {
    const found = filteredDocs.find((d) => d.id === selectedId);
    return found || filteredDocs[0] || null;
  }, [filteredDocs, selectedId]);

  // Group by category preserving logical order
  const categories = useMemo(() => {
    const map = new Map<string, DocItem[]>();
    for (const d of filteredDocs) {
      const list = map.get(d.category) ?? [];
      list.push(d);
      map.set(d.category, list);
    }
    return map;
  }, [filteredDocs]);

  // Render markdown securely
  const renderedHtml = useMemo(() => {
    if (!currentDoc) return "";
    const raw = md.render(currentDoc.content);
    return sanitizeHtml(raw);
  }, [currentDoc]);

  return (
    <div className="docs-backdrop" onClick={onClose}>
      <div
        className="docs-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ayaz Documentation Hub"
      >
        {/* Header */}
        <header className="docs-header">
          <div className="docs-brand">
            <span className="docs-brand-glyph">{"\uf02d"}</span>
            <span>Ayaz Documentation Hub</span>
            <span className="docs-badge">v0.5.0</span>
          </div>

          <div className="docs-search-wrap">
            <span className="docs-search-icon">{"\uf002"}</span>
            <input
              ref={inputRef}
              type="text"
              className="docs-search-input"
              placeholder="Search docs, keys & commands... (Esc to close)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              spellCheck={false}
            />
          </div>

          <button
            type="button"
            className="docs-close-btn"
            onClick={onClose}
            aria-label="Close docs"
            title="Close (Esc)"
          >
            {"\uf00d"}
          </button>
        </header>

        {/* Body */}
        <div className="docs-body">
          {/* Sidebar */}
          <nav className="docs-sidebar" aria-label="Documentation Sidebar">
            {Array.from(categories.entries()).map(([cat, items]) => (
              <div key={cat} className="docs-category">
                <span className="docs-category-title">{cat}</span>
                {items.map((item) => {
                  const active = currentDoc?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`docs-nav-item ${active ? "active" : ""}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span className="docs-nav-icon">{item.icon}</span>
                      <span>{item.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Content area */}
          <main className="docs-content" role="region" aria-label="Document view">
            {currentDoc ? (
              <>
                <div className="docs-breadcrumbs">
                  <span>Docs</span>
                  <span>›</span>
                  <span>{currentDoc.category}</span>
                  <span>›</span>
                  <span className="docs-breadcrumbs-current">{currentDoc.title}</span>
                </div>

                <article
                  className="docs-markdown"
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              </>
            ) : (
              <div className="docs-empty-search">
                <p>No documentation found matching &quot;{search}&quot;.</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
