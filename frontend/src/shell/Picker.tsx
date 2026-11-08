import { useEffect, useRef, useState } from "react";
import { Glyph } from "./Tree";

export interface Item {
  label: string;
  positions?: number[]; // code point indices into label to highlight
  icon?: [string, string];
  hint?: string; // right-aligned, e.g. the key binding or [+]
}

export interface PickerSource {
  title: string;
  query(q: string): Promise<Item[]>;
  pick(item: Item): void;
}

// Fuzzy picker overlay (files, recent, buffers, commands). Every keystroke queries; stale answers are dropped by sequence number.
export function Picker({ source, onClose }: { source: PickerSource; onClose(): void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [cur, setCur] = useState(0);
  const seq = useRef(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const n = ++seq.current;
    source.query(q).then((r) => {
      if (n !== seq.current) return;
      setItems(r);
      setCur(0);
    }, () => n === seq.current && setItems([]));
  }, [q, source]);

  useEffect(() => list.current?.children[cur]?.scrollIntoView({ block: "nearest" }), [cur]);

  const pick = (i: number) => {
    const it = items[i];
    onClose();
    if (it) source.pick(it);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const move = (d: number) => setCur((c) => Math.max(0, Math.min(items.length - 1, c + d)));
    const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === "ArrowDown" || ctrl && (e.key === "n" || e.key === "j")) move(1);
    else if (e.key === "ArrowUp" || ctrl && (e.key === "p" || e.key === "k")) move(-1);
    else if (e.key === "Enter") pick(cur);
    else if (e.key === "Escape" || ctrl && e.key === "c") onClose();
    else return;
    e.preventDefault();
  };

  return (
    <div className="picker-backdrop" onMouseDown={onClose}>
      <div className="picker" role="dialog" aria-label={source.title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="picker-title">{source.title}</div>
        <input
          autoFocus
          className="picker-input"
          aria-label="Search"
          role="combobox"
          aria-expanded
          aria-controls="picker-list"
          aria-activedescendant={items.length ? `picker-${cur}` : undefined}
          spellCheck={false}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          // Modal: focus stays here until Enter, Esc or a click outside (focus trap).
          onBlur={(e) => { const el = e.currentTarget; requestAnimationFrame(() => el.isConnected && el.focus()); }}
        />
        <ul className="picker-list" id="picker-list" role="listbox" ref={list}>
          {items.map((it, i) => (
            <li
              key={it.label}
              id={`picker-${i}`}
              role="option"
              aria-selected={i === cur}
              className={i === cur ? "picker-item cursor" : "picker-item"}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
            >
              {it.icon && <Glyph icon={it.icon} />}
              <span className="picker-label">{highlight(it.label, it.positions)}</span>
              {it.hint && <span className="picker-hint">{it.hint}</span>}
            </li>
          ))}
          {!items.length && <li className="picker-empty">No matches</li>}
        </ul>
      </div>
    </div>
  );
}

function highlight(label: string, positions?: number[]) {
  if (!positions?.length) return label;
  const at = new Set(positions);
  return Array.from(label).map((ch, i) => (at.has(i) ? <b key={i}>{ch}</b> : ch));
}
