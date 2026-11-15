import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";

// #rgb, #rgba, #rrggbb, #rrggbbaa, not followed by more word characters (so "#define" and "#abcdefg" are not colors).
const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_-])/g;

export function hexColors(text: string): { index: number; color: string }[] {
  return [...text.matchAll(HEX)].map((m) => ({ index: m.index, color: m[0] }));
}

// The picker's #rrggbb for a hex color, and the alpha digits it must keep ("" without alpha).
export function splitHex(color: string): { rgb: string; alpha: string } {
  let h = color.slice(1);
  if (h.length <= 4) h = [...h].map((d) => d + d).join("");
  return { rgb: `#${h.slice(0, 6)}`.toLowerCase(), alpha: h.slice(6) };
}

const MAX_RANGE = 100_000; // characters of one visible range

class Swatch extends WidgetType {
  constructor(readonly color: string) { super(); }
  eq(other: Swatch) { return other.color === this.color; }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-swatch";
    el.style.backgroundColor = this.color;
    const { rgb, alpha } = splitHex(this.color);
    const input = Object.assign(document.createElement("input"), { type: "color", value: rgb, tabIndex: -1 });
    // "change", not "input": the new color rebuilds this widget, which would close the picker while it is dragged.
    input.addEventListener("change", () => {
      const from = view.posAtDOM(el);
      if (view.state.sliceDoc(from, from + this.color.length) !== this.color) return;
      view.dispatch({ changes: { from, to: from + this.color.length, insert: input.value + alpha }, userEvent: "input.replace" });
    });
    el.append(input);
    el.addEventListener("mousedown", (e) => e.preventDefault()); // the cursor stays where it was
    el.addEventListener("click", () => { if (!view.state.readOnly) input.click(); });
    return el;
  }
  ignoreEvent() { return true; }
}

function build(view: EditorView): DecorationSet {
  const out = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    if (to - from > MAX_RANGE) continue; // a minified file's one huge line: scanning it on every key would be felt
    for (const { index, color } of hexColors(view.state.sliceDoc(from, to))) {
      out.add(from + index, from + index, Decoration.widget({ widget: new Swatch(color), side: -1 }));
    }
  }
  return out.finish();
}

// A small box with the color before every hex color in view, as in the color-aware editors; only the visible part is scanned.
export const swatches = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = build(u.view); }
  },
  { decorations: (v) => v.decorations },
);
