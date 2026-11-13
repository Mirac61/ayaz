import React, { useEffect, useRef } from "react";
import { backend } from "../core/backend";
import { AyazLogo } from "./AyazLogo";

export interface WhatsNewDialogProps {
  version?: string;
  onClose(): void;
}

const HIGHLIGHTS = [
  {
    icon: "❄",
    title: "Kristallines UI-Redesign (Glacier Edition)",
    desc: "Crystalline Chamfer Tab-Bar (5px Micro-Cut), singulärer 4px Focus Crystal, kompakte 28px Frost-Titlebar und Glacier Dock Statusleiste.",
  },
  {
    icon: "🚀",
    title: "Neuer Startbildschirm & Bento Welcome Hub",
    desc: "Schnellstart, Git Clone Modal mit Ordnerauswahl, interaktive Theme-Palette (10 Themes live schaltbar), Projekt-Echtzeitfilter und Tastatur-Cheatsheet.",
  },
  {
    icon: "⎇",
    title: "Vollständige Git Remote Suite",
    desc: "Direktes Git Push (<Space>gp), Pull (<Space>gl), Fetch (<Space>gf) und Rebase (<Space>grb) in der Sidebar und Palette.",
  },
  {
    icon: "⌨",
    title: "Vim Modal & Tastatur-Präzision",
    desc: "Crystalline Diamond Mode Pills (◈ NORMAL, ✎ INSERT, ❖ VISUAL, ↺ REPLACE) und zuverlässiger Tippschutz ohne Tastatur-Hijacking in Textfeldern.",
  },
];

export const WhatsNewDialog: React.FC<WhatsNewDialogProps> = ({
  version = "v0.5.0",
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>(".welcome-modal-close")?.focus();
    return () => prevFocused?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="welcome-modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="welcome-modal"
        style={{ maxWidth: 600 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Was ist neu in Ayaz"
      >
        <div className="welcome-modal-header">
          <div className="welcome-modal-title">
            <AyazLogo size={22} variant="frost" />
            <span>Was ist neu in Ayaz {version}</span>
            <span className="welcome-version-badge">{version}</span>
          </div>
          <button
            type="button"
            className="welcome-modal-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <div className="welcome-modal-body" style={{ gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--fg-3)" }}>
            Ayaz {version} bringt umfassende Neuerungen für eine noch schnellere, kristalline und tastatur-zentrierte Entwicklungserfahrung:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            {HIGHLIGHTS.map((h) => (
              <div
                key={h.title}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 12px",
                  background: "var(--bg-0)",
                  border: "1px solid var(--edge)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ fontSize: 18, color: "var(--accent)", lineHeight: 1 }}>
                  {h.icon}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ font: "600 13px var(--font-sans)", color: "var(--fg-1)" }}>
                    {h.title}
                  </span>
                  <span style={{ font: "400 11px/15px var(--font-mono)", color: "var(--fg-3)" }}>
                    {h.desc}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="welcome-modal-footer">
          <button
            type="button"
            className="welcome-btn secondary"
            onClick={() => void backend.openURL("https://github.com/Mirac61/ayaz/releases")}
          >
            GitHub Release Notes ↗
          </button>
          <button
            type="button"
            className="welcome-btn primary"
            onClick={onClose}
          >
            Verstanden & Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
