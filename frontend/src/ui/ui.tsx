import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import "./ui.css";

// The chrome never takes the focus from the editor: buttons use mousedown with preventDefault and tabIndex -1.
const press = (fn: () => void) => (e: SyntheticEvent) => { e.preventDefault(); fn(); };

// A square button with a Nerd Font glyph (the glyph is CSS content, so it never lands in the DOM text).
export function IconButton({ glyph, label, tip, onPress }: { glyph: string; label: string; tip?: string; onPress(): void }) {
  return <button type="button" className="ui-icon" data-glyph={glyph} title={tip ?? label} aria-label={label} tabIndex={-1}
    onMouseDown={press(onPress)} />;
}

// A statusline field: a button when it does something, plain text when it only informs.
export function Seg({ className, title, onPress, children }:
  { className?: string; title?: string; onPress?(): void; children: ReactNode }) {
  const cls = className ? `seg ${className}` : "seg";
  return onPress
    ? <button type="button" className={cls} title={title} tabIndex={-1} onMouseDown={press(onPress)}>{children}</button>
    : <span className={cls} title={title}>{children}</span>;
}

export interface MenuItem {
  label: string;
  hint?: string; // the key that does the same
  glyph?: string; // Nerd Font glyph before the label
  run(): void;
}

const MENU_ROW = 28; // px, --row in tokens.css
const MENU_W = 240; // min-width 220 plus its border and a little room

// A menu at a point. Esc, a click outside or a pick closes it; the pick runs after it is gone.
export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number }; items: MenuItem[]; onClose(): void }) {
  const [sel, setSel] = useState(0);
  const selRef = useRef(0);
  selRef.current = sel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = e.key === "ArrowDown" || (e.ctrlKey && e.key === "n") ? 1 : e.key === "ArrowUp" || (e.ctrlKey && e.key === "p") ? -1 : 0;
      if (e.key !== "Escape" && e.key !== "Enter" && !step) return;
      e.preventDefault();
      e.stopPropagation();
      if (step) setSel((i) => (i + step + items.length) % items.length);
      else if (e.key === "Enter") { onClose(); items[selRef.current].run(); }
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const left = Math.max(0, Math.min(at.x, window.innerWidth - MENU_W));
  const top = Math.max(0, Math.min(at.y, window.innerHeight - items.length * MENU_ROW - 12));
  const away = (e: SyntheticEvent) => { e.preventDefault(); onClose(); };
  return (
    <>
      <div className="ui-backdrop" onMouseDown={away} onContextMenu={away} />
      <menu className="ui-menu" role="menu" style={{ left, top }}>
        {items.map((it, i) => (
          <button key={it.label} type="button" role="menuitem" className={i === sel ? "sel" : undefined}
            onMouseEnter={() => setSel(i)} onMouseDown={press(() => { onClose(); it.run(); })}>
            <span className="ui-menu-label" data-glyph={it.glyph}>{it.label}</span>
            {it.hint && <kbd>{it.hint}</kbd>}
          </button>
        ))}
      </menu>
    </>
  );
}
