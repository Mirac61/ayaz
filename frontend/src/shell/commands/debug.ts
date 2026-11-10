// The debugger (M48): breakpoints now; start, step and variables come with the session.
import type { Command } from "../../core/commands";
import type { Ctx } from "./context";

export function debugCommands(c: Ctx): Command[] {
  return [
    {
      id: "debug.toggleBreakpoint",
      title: "Toggle breakpoint on this line (<Space>db)",
      run() {
        const on = c.ed.toggleBreakpoint();
        if (on === null) c.fail("No editor here to put a breakpoint in");
        else c.say(on ? "Breakpoint set" : "Breakpoint removed");
      },
    },
  ];
}
