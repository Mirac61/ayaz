// Commands for the window around the editor: tabs, back/forward, wrap, zoom, new window, settings.
import { backend } from "../../core/backend";
import type { Command } from "../../core/commands";
import { availableThemes, setThemeOverride, themeName } from "../../core/settings";
import { LIMIT } from "./context";
import { setZoom, zoomLevel, ZOOM_STEP } from "../zoom";
import type { Ctx } from "./context";

const TABS_KEY = "ayaz.tabs";

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
      id: "view.wrap",
      title: "Toggle line wrap",
      run() {
        const on = !ed.wrapped();
        ed.setWrap(on);
        say(on ? "Line wrap on" : "Line wrap off");
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
      title: "Toggle reading view",
      run: () => { if (!ed.toggleReading()) fail("Reading view is for Markdown files"); },
    },
    {
      id: "theme.switch",
      title: "Switch theme",
      run: () => {
        const names = availableThemes();
        setPicker({
          title: "Theme",
          start: Math.max(names.indexOf(themeName()), 0),
          async query(query) {
            const ms = query.trim()
              ? await backend.rank(names, query, LIMIT)
              : names.map((path) => ({ path, positions: [] }));
            return ms.map((m) => ({ label: m.path, positions: m.positions ?? [], hint: m.path === themeName() ? "current" : undefined }));
          },
          pick(it) {
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
