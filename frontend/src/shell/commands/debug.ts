// The debugger (M48, M70): breakpoints, starting, stepping, stopping and the variables of the stopped program.
import type { Command } from "../../core/commands";
import { formatBreakpointPrompt, parseBreakpointPrompt } from "../../editor/breakpoints";
import { lines, type Row } from "../../debug/variables";
import { installHint } from "../../editor/lsp";
import type { Item, PickerSource } from "../Picker";
import { errText, type Ctx } from "./context";

export function debugCommands(c: Ctx): Command[] {
  // The variables as a list: Enter opens a variable that has something below it (the list comes back with it open),
  // on any other it says its whole value. Typing filters.
  const variables = (rows: Row[], start = 0): PickerSource => {
    const shown = lines(rows), byItem = new WeakMap<Item, Row>();
    const items = shown.map((l): Item => {
      const item = { label: l.label, hint: l.hint };
      byItem.set(item, l.row);
      return item;
    });
    return {
      title: "Variables of the stopped program",
      start,
      query: async (q) => items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())),
      pick(item) {
        const row = byItem.get(item);
        if (!row) return;
        if (row.ref <= 0) return c.say(`${row.name} = ${row.value}`);
        void c.dbg.toggleRow(row).then(
          () => c.setPicker(variables(rows, shown.findIndex((l) => l.row === row))),
          (e) => c.fail(errText(e)),
        );
      },
    };
  };

  // The adapter ending before it launched usually means Delve isn't installed; the stream's "missing" status said so too.
  const startFailed = (e: unknown) => {
    const text = errText(e);
    c.fail(text.includes("ended") ? `${text}. Is dlv installed? ${installHint("dlv")}` : text);
  };

  return [
    {
      id: "debug.toggleBreakpoint",
      title: "Toggle breakpoint on this line (<Space>db)",
      run() {
        const on = c.ed.toggleBreakpoint();
        if (on === null) return c.fail("No editor here to put a breakpoint in");
        c.say(on ? "Breakpoint set" : "Breakpoint removed");
        const path = c.ed.current()?.path;
        if (path) c.dbg.breakpointsChanged(path, c.ed.breakpoints()[path] ?? []); // a running session learns of it
      },
    },
    {
      id: "debug.conditionalBreakpoint",
      title: "Edit conditional breakpoint (<Space>dB)",
      run() {
        const cur = c.ed.getBreakpoint();
        const initial = cur ? formatBreakpointPrompt(cur) : "";
        c.prompt("Breakpoint condition (plain text = condition, log: text = logpoint, hits: 5 = hit count)", initial, async (text) => {
          const parsed = parseBreakpointPrompt(text);
          const bp = c.ed.setBreakpoint(parsed);
          if (!bp) return c.fail("No editor here to put a breakpoint in");
          const kind = bp.logMessage ? "Logpoint" : (bp.condition || bp.hitCondition ? "Conditional breakpoint" : "Breakpoint");
          c.say(`${kind} set on line ${bp.line}`);
          const path = c.ed.current()?.path;
          if (path) c.dbg.breakpointsChanged(path, c.ed.breakpoints()[path] ?? []);
        });
      },
    },
    {
      id: "debug.start",
      title: "Debug the folder's Go package (<Space>dd)",
      run: () => c.dbg.start().catch(startFailed),
    },
    {
      id: "debug.continue",
      title: "Debug: continue, or start (F5, <Space>dc)",
      run: () => (c.dbg.status === "idle" ? c.dbg.start().catch(startFailed) : c.dbg.step("continue")),
    },
    { id: "debug.next", title: "Debug: step over (F10, <Space>dn)", run: () => void c.dbg.step("next") },
    { id: "debug.stepIn", title: "Debug: step into (F11, <Space>ds)", run: () => void c.dbg.step("stepIn") },
    { id: "debug.stepOut", title: "Debug: step out (Shift+F11, <Space>do)", run: () => void c.dbg.step("stepOut") },
    {
      id: "debug.variables",
      title: "Debug: variables of the stopped program (<Space>dv)",
      run: () => void c.dbg.variables().then((rows) => (rows ? c.setPicker(variables(rows)) : c.say("The program isn't stopped")),
        (e) => c.fail(errText(e))),
    },
    { id: "debug.stop", title: "Debug: stop (<Space>dq)", run: () => void c.dbg.stop() },
    { id: "debug.output", title: "Debug: show the program's output (<Space>dl)", run: () => void c.ed.showOutput() },
  ];
}
