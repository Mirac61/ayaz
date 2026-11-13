import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { BookOpen, Search, X } from "lucide-react";
import { DOC_ITEMS, type DocItem } from "../docs/docsData";
import "./docsHub.css";

export interface DocsHubProps {
  onClose(): void;
}

const md = new MarkdownIt({ html: true, linkify: true });

export const DocsHub: React.FC<DocsHubProps> = ({ onClose }) => {
  const [selectedId, setSelectedId] = useState<string>(DOC_ITEMS[0].id);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  // Group by category
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
    return DOMPurify.sanitize(raw);
  }, [currentDoc]);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="docs-backdrop">
          <Dialog.Content
            className="docs-container"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          >
            {/* Header */}
            <header className="docs-header">
              <div className="docs-brand">
                <BookOpen size={18} className="docs-brand-icon" />
                <span>Ayaz Documentation</span>
                <span className="docs-badge">v0.5.0</span>
              </div>

              <div className="docs-search-wrap">
                <Search size={14} className="docs-search-icon" />
                <input
                  ref={inputRef}
                  type="text"
                  className="docs-search-input"
                  placeholder="Docs & Befehle durchsuchen... (Esc zum Schließen)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  spellCheck={false}
                />
              </div>

              <Dialog.Close asChild>
                <button
                  type="button"
                  className="docs-close-btn"
                  onClick={onClose}
                  aria-label="Schließen"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </header>

            {/* Body */}
            <div className="docs-body">
              {/* Sidebar */}
              <nav className="docs-sidebar" aria-label="Documentation Sidebar">
                {Array.from(categories.entries()).map(([cat, items]) => (
                  <div key={cat} className="docs-category">
                    <span className="docs-category-title">{cat}</span>
                    {items.map((item) => {
                      const Icon = item.icon;
                      const active = currentDoc?.id === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`docs-nav-item ${active ? "active" : ""}`}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <Icon size={14} className="docs-nav-icon" />
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
                    <p>Keine Dokumente gefunden für &quot;{search}&quot;.</p>
                  </div>
                )}
              </main>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
