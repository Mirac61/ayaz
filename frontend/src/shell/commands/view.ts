// Commands for the window around the editor: tabs, back/forward, wrap, zoom, new window, settings.
import { backend } from "../../core/backend";
import type { Command } from "../../core/commands";
import { availableThemes, setThemeOverride, themeName, toggleGlass } from "../../core/settings";
import { LIMIT } from "./context";
import { SKINS, setSkin, skin } from "../../editor/mdrender";
import { BROWSER } from "../../core/viewers";
import { localUrl } from "../../viewers/browser";
import { toggleDiagText } from "../diagText";
import { setZoom, zoomLevel, ZOOM_STEP } from "../zoom";
import type { Ctx } from "./context";

const TABS_KEY = "ayaz.tabs";
let lastBrowse = "localhost:3000";

export function viewCommands({ ed, say, fail, setPicker }: Ctx): Command[] {
  // In a terminal: the terminal font only (every terminal); elsewhere the whole page.
  const zoomBy = async (d: number) => {
    if (ed.isTerm()) return say(`Terminal font ${ed.zoomTerms(Math.sign(d))} px`);
    const z = await setZoom(d ? zoomLevel() + d : 1);
    say(`Zoom ${Math.round(z * 100)} %`);
  };

  return [
    {
      id: "view.tabs",
      title: "Toggle tab bar",
      run() {
        let saved: string | null = null;
        try { saved = localStorage.getItem(TABS_KEY); } catch { /* a convenience */ }
        const on = saved === null && !document.querySelector(".tabbar") ? true : !ed.tabsOn;
        ed.setTabs(on);
        try { localStorage.setItem(TABS_KEY, on ? "on" : "off"); } catch { /* a convenience */ }
      },
    },
    {
      id: "view.glass",
      title: "Toggle transparency",
      run: () => say(toggleGlass() ? "Transparency on" : "Transparency off"),
    },
    {
      id: "md.skin",
      title: "Next Markdown skin (rendered view)",
      run() {
        const next = SKINS[(SKINS.indexOf(skin()) + 1) % SKINS.length];
        setSkin(next);
        say(`Markdown skin: ${next}`);
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
      id: "view.diagnosticText",
      title: "Toggle diagnostic text after the line",
      run: () => say(toggleDiagText() ? "Diagnostic text on" : "Diagnostic text off"),
    },
    {
      id: "browser.open",
      title: "Browser tab for a local page (:browse 3000)",
      async run(arg) {
        const url = localUrl(arg?.trim() || lastBrowse);
        if (!url) return fail("Only local addresses: localhost, 127.0.0.1, [::1]");
        lastBrowse = url.slice(url.indexOf("//") + 2);
        await ed.open(`${BROWSER}${lastBrowse}`).catch((e) => fail(e instanceof Error ? e.message : String(e)));
      },
    },
    { id: "tab.next", title: "Next tab (gt)", run: () => ed.tabMove(1) },
    { id: "tab.prev", title: "Previous tab (gT)", run: () => ed.tabMove(-1) },
    { id: "tab.close", title: "Close tab", run: () => ed.tabClose() },
    { id: "tab.reopen", title: "Reopen closed tab", run: async () => { if (!(await ed.reopen())) fail("No closed tab"); } },
    { id: "nav.back", title: "Back to the previous file", run: async () => { if (!(await ed.nav(-1))) fail("At the start"); } },
    { id: "nav.forward", title: "Forward to the next file", run: async () => { if (!(await ed.nav(1))) fail("At the end"); } },
    {
      id: "md.reading",
      title: "Toggle rendered view and source (Markdown, SVG)",
      run: () => { if (!ed.toggleRendered()) fail("Rendered view is for Markdown and SVG files"); },
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
            const ms = query.trim()
              ? await backend.rank(names, query, LIMIT)
              : names.map((path) => ({ path, positions: [] }));
            return ms.map((m) => ({ label: m.path, positions: m.positions ?? [], hint: m.path === themeName() ? "current" : undefined }));
          },
          // The cursor tries the theme; leaving without a pick puts the old one back.
          cursor: (it) => void (it && setThemeOverride(it.label)),
          close: () => void (!chosen && setThemeOverride(before)),
          pick(it) {
            chosen = true;
            if (!setThemeOverride(it.label)) return fail(`Unknown theme ${it.label}`);
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
  } catch { /* default: tabs on */ }
}
