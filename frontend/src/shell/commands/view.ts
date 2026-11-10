// Commands for the window around the editor: tabs, back/forward, wrap, zoom, new window, settings.
import { backend } from "../../core/backend";
import type { Command } from "../../core/commands";
import { setZoom, zoomLevel, ZOOM_STEP } from "../zoom";
import type { Ctx } from "./context";

const TABS_KEY = "ayaz.tabs";

export function viewCommands({ ed, say, fail }: Ctx): Command[] {
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
        const on = !ed.tabsOn;
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
    { id: "window.new", title: "New window", run: () => backend.newWindow() },
    { id: "settings.open", title: "Open settings", run: () => backend.openSettings() },
    { id: "view.zoomIn", title: "Zoom in", run: () => zoomBy(ZOOM_STEP) },
    { id: "view.zoomOut", title: "Zoom out", run: () => zoomBy(-ZOOM_STEP) },
    { id: "view.zoomReset", title: "Reset zoom", run: () => zoomBy(0) },
  ];
}

// Restores the tab bar's last state; the Workbench calls it once per Editors.
export function restoreTabs(ed: Ctx["ed"]) {
  try {
    ed.setTabs(localStorage.getItem(TABS_KEY) === "on");
  } catch { /* default: no tabs */ }
}
