// Commands for the window around the editor: tabs, back/forward, wrap, zoom, new window, settings.
import { EditorView } from "@codemirror/view";
import { backend } from "../../core/backend";
import type { Command } from "../../core/commands";
import { availableThemes, setThemeOverride, themeName, toggleGlass } from "../../core/settings";
import { LIMIT } from "./context";
import { revealHeading, SKINS, setSkin, skin, type Skin } from "../../editor/mdrender";
import { mdHeadings } from "../../editor/mdlive";
import { BROWSER, PREVIEW } from "../../core/viewers";
import { localUrl } from "../../viewers/browser";
import { toggleDiagText } from "../diagText";
import { setZoom, zoomLevel, ZOOM_STEP } from "../zoom";
import type { Ctx } from "./context";

const TABS_KEY = "ayaz.tabs";
let lastBrowse = "localhost:3000";
const SKIN_HINTS: Record<Skin, string> = {
  github: "like on GitHub",
  kairo: "calm, narrow column",
  document: "serif, for long reads",
  compact: "dense, for notes and tables",
  wide: "full width, for wide tables",
};

export function viewCommands({ ed, say, fail, setPicker }: Ctx): Command[] {
  // In a terminal: the terminal font only (every terminal); elsewhere the whole page.
  const zoomBy = async (d: number) => {
    if (ed.isTerm()) {
      return say(`Terminal font ${ed.zoomTerms(Math.sign(d))} px`);
    }
    const z = await setZoom(d ? zoomLevel() + d : 1);
    say(`Zoom ${Math.round(z * 100)} %`);
  };

  return [
    {
      id: "view.tabs",
      title: "Toggle tab bar",
      run() {
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(TABS_KEY);
        } catch {
          /* a convenience */
        }
        const on = saved === null && !document.querySelector(".tabbar") ? true : !ed.tabsOn;
        ed.setTabs(on);
        try {
          localStorage.setItem(TABS_KEY, on ? "on" : "off");
        } catch {
          /* a convenience */
        }
      },
    },
    {
      id: "view.glass",
      title: "Toggle transparency",
      run: () => say(toggleGlass() ? "Transparency on" : "Transparency off"),
    },
    {
      id: "md.skin",
      title: "Markdown skin (rendered view)",
      run() {
        const before = skin();
        let chosen = false;
        setPicker({
          title: "Markdown skin",
          start: SKINS.indexOf(before),
          async query(q) {
            const ms = q.trim() ? await backend.rank([...SKINS], q, LIMIT) : SKINS.map((path) => ({ path, positions: [] }));
            return ms.map((m) => ({ label: m.path, hint: SKIN_HINTS[m.path as Skin], positions: m.positions ?? [] }));
          },
          // the cursor tries a skin on an open reading view; leaving without a pick puts the old one back
          cursor: (it) => void (it && setSkin(it.label as Skin)),
          close: () => void (!chosen && setSkin(before)),
          pick(it) {
            chosen = true;
            setSkin(it.label as Skin);
            say(`Markdown skin: ${it.label}`);
          },
        });
      },
    },
    {
      id: "view.wrap",
      title: "Toggle line wrap",
      run() {
        const on = !ed.wrapped();
        ed.setWrap(on);
        say(on ? "Line wrap on" : "Line wrap off");
      },
    },
    {
      id: "view.spellcheck",
      title: "Toggle prose spellcheck (<Space>us)",
      run() {
        const on = ed.toggleSpellcheck();
        if (on === null) {
          return fail("No editor here for spellcheck");
        }
        say(on ? "Spellcheck on" : "Spellcheck off");
      },
    },
    {
      id: "view.diagnosticText",
      title: "Toggle diagnostic text after the line",
      run: () => say(toggleDiagText() ? "Diagnostic text on" : "Diagnostic text off"),
    },
    {
      id: "editor.toggleVim",
      title: "Toggle Vim mode (modal / standard)",
      run() {
        const on = ed.toggleVim();
        say(on ? "Vim mode enabled (◈ NORMAL)" : "Standard mode enabled (◇ STANDARD)");
      },
    },
    {
      id: "browser.open",
      title: "Browser tab for a local page or HTML file (:browse 3000)",
      async run(arg) {
        const text = arg?.trim();
        if (text) {
          const url = localUrl(text);
          if (url) {
            lastBrowse = url.slice(url.indexOf("//") + 2);
            return ed.open(`${BROWSER}${lastBrowse}`).catch((e) => fail(e instanceof Error ? e.message : String(e)));
          }
          if (/\.(html|htm)$/i.test(text)) {
            return ed.open(PREVIEW + text.replace(/^\.\//, "")).catch((e) => fail(e instanceof Error ? e.message : String(e)));
          }
          return fail("Only local addresses (localhost:3000) or .html files");
        }

        const cur = ed.currentTab(ed.active);
        if (cur?.startsWith(BROWSER) || cur?.startsWith(PREVIEW)) {
          return ed.open(cur).catch((e) => fail(e instanceof Error ? e.message : String(e)));
        }
        if (cur && /\.(html|htm)$/i.test(cur)) {
          return ed.open(PREVIEW + cur).catch((e) => fail(e instanceof Error ? e.message : String(e)));
        }

        const url = localUrl(lastBrowse);
        if (!url) {
          return fail("Only local addresses (localhost:3000) or .html files");
        }
        lastBrowse = url.slice(url.indexOf("//") + 2);
        await ed.open(`${BROWSER}${lastBrowse}`).catch((e) => fail(e instanceof Error ? e.message : String(e)));
      },
    },
    { id: "tab.next", title: "Next tab (gt)", run: () => ed.tabMove(1) },
    { id: "tab.prev", title: "Previous tab (gT)", run: () => ed.tabMove(-1) },
    { id: "tab.close", title: "Close tab", run: () => ed.tabClose() },
    {
      id: "tab.reopen",
      title: "Reopen closed tab",
      run: async () => {
        if (!(await ed.reopen())) {
          fail("No closed tab");
        }
      },
    },
    {
      id: "nav.back",
      title: "Back to the previous file",
      run: async () => {
        if (!(await ed.nav(-1))) {
          fail("At the start");
        }
      },
    },
    {
      id: "nav.forward",
      title: "Forward to the next file",
      run: async () => {
        if (!(await ed.nav(1))) {
          fail("At the end");
        }
      },
    },
    {
      id: "md.reading",
      title: "Toggle rendered view and source (Markdown, SVG, HTML)",
      run: () => {
        if (!ed.toggleRendered()) {
          fail("Rendered view is for Markdown, SVG and HTML files");
        }
      },
    },
    {
      id: "md.outline",
      title: "Document headings / outline (<Space>mh)",
      run() {
        const v = ed.activeView();
        if (!v) {
          return fail("No active editor");
        }
        const headings = mdHeadings(v.state);
        if (!headings.length) {
          return fail("No headings found in document");
        }
        const items = headings.map((h, i) => ({
          label: `${"  ".repeat(h.level - 1)}${"#".repeat(h.level)} ${h.text}`,
          hint: `:${h.line}`, // the line tells apart headings of the same text (### Features in a changelog)
          glyph: "\uf02e",
          ...h,
          nth: headings.slice(0, i).filter((o) => o.text === h.text).length,
        }));
        // the heading the cursor is under, so the list opens where you are
        const at = v.state.selection.main.head;
        const here = Math.max(items.filter((h) => h.from <= at).length - 1, 0);
        setPicker({
          title: "Outline",
          start: here,
          async query(q) {
            const trimmed = q.trim();
            if (!trimmed) {
              return items.map((it) => ({ label: it.label, hint: it.hint, glyph: it.glyph, positions: [] }));
            }
            const ms = await backend.rank(
              items.map((it) => it.label),
              trimmed,
              LIMIT,
            );
            // equal labels rank as one name: hand each match the next heading of that label
            const used = new Set<number>();
            return ms.flatMap((m) => {
              const i = items.findIndex((it, j) => it.label === m.path && !used.has(j));
              if (i < 0) {
                return [];
              }
              used.add(i);
              const it = items[i];
              return [{ label: it.label, hint: it.hint, glyph: it.glyph, positions: m.positions ?? [] }];
            });
          },
          pick(it) {
            const match = items.find((cand) => cand.label === it.label && cand.hint === it.hint);
            if (!match) {
              return;
            }
            v.dispatch({
              selection: { anchor: match.from },
              effects: EditorView.scrollIntoView(match.from, { y: "start" }),
            });
            revealHeading(v, match.text, match.nth); // the reading view covers the editor: scroll it too
            say(`Heading: ${match.text}`);
          },
        });
      },
    },
    {
      id: "theme.switch",
      title: "Switch theme",
      run: () => {
        const names = availableThemes();
        const before = themeName();
        let chosen = false;
        setPicker({
          title: "Theme",
          start: Math.max(names.indexOf(themeName()), 0),
          async query(query) {
            const ms = query.trim() ? await backend.rank(names, query, LIMIT) : names.map((path) => ({ path, positions: [] }));
            return ms.map((m) => ({
              label: m.path,
              positions: m.positions ?? [],
              hint: m.path === themeName() ? "current" : undefined,
            }));
          },
          // The cursor tries the theme; leaving without a pick puts the old one back.
          cursor: (it) => void (it && setThemeOverride(it.label)),
          close: () => void (!chosen && setThemeOverride(before)),
          pick(it) {
            chosen = true;
            if (!setThemeOverride(it.label)) {
              return fail(`Unknown theme ${it.label}`);
            }
            ed.settingsChanged(); // open terminals take the new colors
            say(`Theme ${it.label} (until restart: set "theme" in settings.json to keep it)`);
          },
        });
      },
    },
    { id: "window.new", title: "New window", run: () => backend.newWindow() },
    { id: "settings.open", title: "Open settings (:settings)", run: () => backend.openSettings() },
    { id: "view.zoomIn", title: "Zoom in", run: () => zoomBy(ZOOM_STEP) },
    { id: "view.zoomOut", title: "Zoom out", run: () => zoomBy(-ZOOM_STEP) },
    { id: "view.zoomReset", title: "Reset zoom", run: () => zoomBy(0) },
  ];
}

// Restores the tab bar's last state; the Workbench calls it once per Editors.
export function restoreTabs(ed: Ctx["ed"]) {
  try {
    ed.setTabs(localStorage.getItem(TABS_KEY) !== "off");
  } catch {
    /* default: tabs on */
  }
}
