import { showPanel, EditorView, type Panel } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { settings } from "../core/settings";
import { scopesAt } from "./vim/structure";

// Sticky scroll: the lines of the functions and classes whose start has scrolled out of view stay on top,
// so you see where you are in a long function. A click on one jumps to it. "stickyScroll": false in settings.json.

const MAX = 3; // rows; deeper scopes keep only the innermost ones

// The header of a scope: its first line without the opening brace, the way you'd read it as a signature.
export const header = (line: string) => line.trim().replace(/\s*\{\s*$/, "");

// The panel does it all: rendering waits for an animation frame because layout can't be read during an update.
function panel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "cm-sticky";
  let frame = 0, shown = "";

  const render = () => {
    const state = view.state;
    // The first line at the top of the scroller; scopes that start above it and still reach it are the sticky ones.
    const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
    const rows = settings().stickyScroll
      ? scopesAt(state, top.from).filter((s) => state.doc.lineAt(s.from).from < top.from && s.to > top.from)
      : [];
    const lines = rows.slice(-MAX).map((s) => ({ at: s.from, text: header(state.doc.lineAt(s.from).text) }));
    const key = lines.map((l) => `${l.at}:${l.text}`).join("\n");
    if (key === shown) return;
    shown = key;
    dom.style.display = lines.length ? "" : "none";
    dom.replaceChildren(...lines.map((l) => {
      const row = document.createElement("div");
      row.className = "cm-sticky-row";
      row.textContent = l.text;
      row.onmousedown = (e) => {
        e.preventDefault();
        view.dispatch({ selection: { anchor: l.at }, effects: EditorView.scrollIntoView(l.at, { y: "start" }) });
        view.focus();
      };
      return row;
    }));
  };
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  };

  view.scrollDOM.addEventListener("scroll", schedule, { passive: true });
  schedule();
  return {
    dom,
    top: true,
    update: schedule, // a change can move the scopes, a reconfigure turns the setting on or off
    destroy() {
      cancelAnimationFrame(frame);
      view.scrollDOM.removeEventListener("scroll", schedule);
    },
  };
}

const theme = EditorView.baseTheme({
  ".cm-sticky": { borderBottom: "1px solid rgb(255 255 255 / 0.08)", backgroundColor: "var(--bg-1, #161617)", padding: "2px 0" },
  ".cm-sticky-row": {
    padding: "0 16px", whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer", color: "#a1a1a6",
    fontFamily: "var(--font-mono)", fontSize: "var(--editor-font-size, 13px)", lineHeight: "1.6",
  },
  ".cm-sticky-row:hover": { color: "#dcd7ba" },
});

export const stickyScroll: Extension = [showPanel.of(panel), theme];
