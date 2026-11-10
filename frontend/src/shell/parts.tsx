import { useEffect, useRef } from "react";
import { parseKeys, type Binding } from "../core/keymap";

// The which-key box: one row per next key; a key that only leads further shows how many bindings follow.
export function Hints({ keys, next, title }: { keys: string[]; next: Binding[]; title(id: string): string }) {
  const groups = new Map<string, Binding[]>();
  for (const b of next) {
    const k = parseKeys(b.keys)[keys.length];
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  return (
    <div className="hints" role="status" aria-label="Next keys">
      <div className="hints-title">{keys.join("")}</div>
      <ul>
        {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([k, bs]) => {
          const exact = bs.find((b) => parseKeys(b.keys).length === keys.length + 1);
          const more = bs.length - (exact ? 1 : 0);
          return (
            <li key={k}>
              <kbd>{k}</kbd>
              <span className={exact ? "" : "group"}>
                {exact ? title(exact.command) : `+${more} keymap${more > 1 ? "s" : ""}`}
                {exact && more > 0 && <span className="group"> +{more}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// A split border or the panel's top edge; dragging it calls onDrag with each pointer move.
export function Handle({ dir, style, onDrag }: { dir: "row" | "col"; style: React.CSSProperties; onDrag(e: PointerEvent): void }) {
  return (
    <div
      className={`resize ${dir}`}
      style={style}
      onPointerDown={(e) => {
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        el.addEventListener("pointermove", onDrag);
        el.addEventListener("pointerup", () => el.removeEventListener("pointermove", onDrag), { once: true });
        e.preventDefault(); // no text selection while dragging
      }}
    />
  );
}

export interface PaneProps {
  id: number;
  active: boolean;
  style: React.CSSProperties;
  edge: { left: boolean; top: boolean };
  mount(el: HTMLDivElement): () => void;
}

// Panes are siblings positioned from the layout rects, so a split never remounts an existing editor.
export function Pane({ id, active, style, edge, mount }: PaneProps) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => mount(el.current!), []);
  const cls = ["pane", active && "active", edge.left && "edge-left", edge.top && "edge-top"].filter(Boolean).join(" ");
  return <div ref={el} className={cls} style={style} data-pane={id} />;
}
