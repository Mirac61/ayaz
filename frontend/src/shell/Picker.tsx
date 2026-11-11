import { useEffect, useRef, useState } from "react";
import { Glyph } from "./Tree";
import type { Preview, Span } from "./preview";

export interface Item {
  label: string;
  positions?: number[]; // code point indices into label to highlight
  icon?: [string, string];
  hint?: string; // right-aligned, e.g. the key binding or [+]
  dim?: number; // leading code points shown quiet, e.g. the folder of a path or the "file:line:" of a hit
  dir?: boolean; // dim is a folder: it gives way first when the row is too narrow, the name stays
}

export interface PickerSource {
  title: string;
  // A streaming source (project search) resolves at once and calls update with the growing list.
  query(q: string, update: (items: Item[]) => void): Promise<Item[]>;
  pick(item: Item, index: number, side?: boolean): void; // side: Cmd/Ctrl+Enter, "open it next to this"
  all?(): void; // <C-q>: everything to the quickfix list
  close?(): void; // the picker went away: stop work
  start?: number; // cursor at open, e.g. the current quickfix entry
  initial?: string; // the input's text at open, e.g. the old name when renaming
  placeholder?: string; // what the empty input says
  footer?: string; // a line of key hints under the list
  limit?: number; // the list is cut at this many rows: a full list says "50+ results"
  preview?(item: Item, index: number): Promise<Preview | null>; // shown beside the list for the cursor item
  cursor?(item: Item | undefined): void; // the cursor item changed, e.g. to try a theme before choosing it
}

const PAGE = 10; // rows PageUp and PageDown move

// Fuzzy picker overlay (files, recent, buffers, commands). Every keystroke queries; stale answers are dropped by sequence number.
export function Picker(props: { source: PickerSource; onClose(): void }) {
  return <PickerBox key={sourceKey(props.source)} {...props} />;
}

// A pick that opens another picker (the palette running :Replace) hands this one a new source while it is still mounted.
// React would keep the instance, with its typed text, its closing flag and a focus that already went back to the editor;
// a key per source mounts a fresh one that takes the focus itself.
const keys = new WeakMap<PickerSource, number>();
let lastKey = 0;
const sourceKey = (s: PickerSource) => {
  if (!keys.has(s)) keys.set(s, ++lastKey);
  return keys.get(s)!;
};

function PickerBox({ source, onClose: closeNow }: { source: PickerSource; onClose(): void }) {
  // Once closing, the focus trap lets go: what a pick opened (a terminal) must keep the focus it took.
  const closing = useRef(false);
  const onClose = () => { closing.current = true; closeNow(); };
  const [q, setQ] = useState(source.initial ?? "");
  const [items, setItems] = useState<Item[]>([]);
  const [cur, setCur] = useState(0);
  // The latest full answer, set before React renders it: an Enter right after it must not count as early.
  const answer = useRef<{ q: string | null; items: Item[]; cur: number }>({ q: null, items: [], cur: 0 });
  const early = useRef(false); // Enter came before the answer to q: pick once it's there
  const seq = useRef(0);
  const list = useRef<HTMLUListElement>(null);
  const [shown, setShown] = useState<Preview | null>(null);
  const code = useRef<HTMLDivElement>(null); // the preview's scroll box

  useEffect(() => {
    const n = ++seq.current;
    source.query(q, (r) => n === seq.current && setItems(r)).then((r) => {
      if (n !== seq.current) return;
      const c = q ? 0 : Math.min(source.start ?? 0, Math.max(r.length - 1, 0));
      answer.current = { q, items: r, cur: c };
      setItems(r);
      setCur(c);
      if (early.current) pick(c, r);
    }, () => {
      if (n !== seq.current) return;
      answer.current = { q, items: [], cur: 0 };
      setItems([]);
      early.current = false;
    });
  }, [q, source]);
  useEffect(() => () => source.close?.(), [source]);

  // void: newer engines return a Promise from scrollIntoView, and an effect's return value is its cleanup.
  useEffect(() => void list.current?.children[cur]?.scrollIntoView({ block: "nearest" }), [cur]);

  // The preview follows the cursor row after a short pause, so holding <C-n> doesn't read a file per row. It depends on the
  // row, not on the list: a search streaming in more hits under an unchanged cursor row needs no new read and no scroll reset.
  const it = items[cur];
  const row = it ? `${cur}\n${it.label}` : "";
  useEffect(() => {
    source.cursor?.(it);
    if (!source.preview) return;
    if (!it) return void setShown(null);
    let stale = false;
    const t = setTimeout(() => {
      source.preview!(it, cur).then((p) => !stale && setShown(p), () => !stale && setShown(null));
    }, 60);
    return () => { stale = true; clearTimeout(t); };
  }, [row, source]);

  const pick = (i: number, from = items, side = false) => {
    const it = from[i];
    early.current = false;
    onClose();
    if (it) source.pick(it, i, side);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const move = (d: number) => setCur((c) => Math.max(0, Math.min(items.length - 1, c + d)));
    const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === "ArrowDown" || ctrl && (e.key === "n" || e.key === "j") || e.key === "Tab" && !e.shiftKey) move(1);
    else if (e.key === "ArrowUp" || ctrl && (e.key === "p" || e.key === "k") || e.key === "Tab" && e.shiftKey) move(-1);
    else if (e.key === "PageDown") move(PAGE);
    else if (e.key === "PageUp") move(-PAGE);
    // Like Telescope: <C-d> and <C-u> scroll the preview by half a page.
    else if (ctrl && (e.key === "d" || e.key === "u") && code.current) {
      code.current.scrollBy({ top: (e.key === "d" ? 1 : -1) * code.current.clientHeight / 2 });
    }
    else if (e.key === "Enter") {
      const a = answer.current;
      if (a.q !== q) early.current = true;
      else pick(a.items === items ? cur : a.cur, a.items, e.metaKey || e.ctrlKey); // not rendered yet: its first item
    }
    else if (ctrl && e.key === "q" && source.all) { onClose(); source.all(); }
    else if (e.key === "Escape" || ctrl && e.key === "c") onClose();
    else return;
    e.preventDefault();
  };

  return (
    <div className="picker-backdrop" onMouseDown={onClose}>
      <div
        className={source.preview ? "picker with-preview" : "picker"}
        role="dialog"
        aria-label={source.title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="picker-head">
          <span className="picker-title label">{source.title}</span>
          <input
            autoFocus
            className="picker-input"
            aria-label="Search"
            placeholder={source.placeholder ?? "Type to filter"}
            role="combobox"
            aria-expanded
            aria-controls="picker-list"
            aria-activedescendant={items.length ? `picker-${cur}` : undefined}
            spellCheck={false}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            // Modal: focus stays here until Enter, Esc or a click outside (focus trap).
            onBlur={(e) => { const el = e.currentTarget; requestAnimationFrame(() => el.isConnected && !closing.current && el.focus()); }}
          />
          <span className="picker-hint">
            {items.length === 1 ? "1 result" : `${items.length}${source.limit && items.length >= source.limit ? "+" : ""} results`}
          </span>
        </div>
        <div className="picker-body">
          <ul className="picker-list" id="picker-list" role="listbox" ref={list}>
            {items.map((it, i) => (
              <li
                key={`${i}:${it.label}`}
                id={`picker-${i}`}
                role="option"
                aria-selected={i === cur}
              aria-label={it.label} // the label is split into spans for the dim part; the name stays one string
                className={i === cur ? "picker-item cursor" : "picker-item"}
                onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              >
                {it.icon && <Glyph icon={it.icon} />}
                <span className={it.dir ? "picker-label split" : "picker-label"}>{highlight(it)}</span>
                {it.hint && <span className="picker-hint">{it.hint}</span>}
              </li>
            ))}
            {!items.length && <li className="picker-empty">No matches</li>}
          </ul>
          {source.preview && <PreviewPane preview={items.length ? shown : null} box={code} />}
        </div>
        {source.footer && <div className="picker-foot">{source.footer}</div>}
      </div>
    </div>
  );
}

function highlight({ label, positions, dim }: Item) {
  if (!positions?.length && !dim) return label;
  const at = new Set(positions);
  const chars = Array.from(label).map((ch, i) => (at.has(i) ? <b key={i}>{ch}</b> : ch));
  if (!dim) return chars;
  return [
    <span key="dim" className="picker-dim">{chars.slice(0, dim)}</span>,
    <span key="rest" className="picker-rest">{chars.slice(dim)}</span>,
  ];
}

// Up to this many lines are drawn: the pane shows a screenful, and a long head would only cost layout.
const PREVIEW_LINES = 200;

function PreviewPane({ preview, box }: { preview: Preview | null; box: React.RefObject<HTMLDivElement> }) {
  // Point at the hit: scroll it to the middle, or back to the top for a file's start.
  useEffect(() => {
    const el = box.current, hit = el?.querySelector<HTMLElement>(".hit");
    if (el) el.scrollTop = hit ? hit.offsetTop - el.clientHeight / 2 : 0;
  }, [preview]);
  if (!preview) return <div className="picker-preview empty">No preview</div>;
  const lines = (preview.spans ?? preview.text.split("\n").map((l): Span[] => [[l, ""]])).slice(0, PREVIEW_LINES);
  return (
    <div className="picker-preview" aria-hidden>
      <div className="picker-preview-title">{preview.title}</div>
      <div className="picker-code" ref={box}>
        {lines.map((l, i) => (
          <div key={i} className={preview.first + i === preview.line ? "hit" : undefined}>
            <i>{preview.first + i}</i>
            {l.map(([text, cls], j) => <span key={j} className={cls || undefined}>{text}</span>)}
            {!l.length && " "}
          </div>
        ))}
        {(preview.more || lines.length === PREVIEW_LINES) && <div className="more">…</div>}
      </div>
    </div>
  );
}
