// The debugger (M48): breakpoints, starting, stepping and stopping. Variables come next.
import type { Command } from "../../core/commands";
import { errText, type Ctx } from "./context";

export function debugCommands(c: Ctx): Command[] {
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
      id: "debug.start",
      title: "Debug the folder's Go package (<Space>dd)",
      run: () => c.dbg.start().catch((e) => c.fail(errText(e))),
    },
    {
      id: "debug.continue",
      title: "Debug: continue, or start (F5, <Space>dc)",
      run: () => (c.dbg.status === "idle" ? c.dbg.start().catch((e) => c.fail(errText(e))) : c.dbg.step("continue")),
    },
    { id: "debug.next", title: "Debug: step over (F10, <Space>dn)", run: () => void c.dbg.step("next") },
    { id: "debug.stepIn", title: "Debug: step into (F11, <Space>ds)", run: () => void c.dbg.step("stepIn") },
    { id: "debug.stepOut", title: "Debug: step out (Shift+F11, <Space>do)", run: () => void c.dbg.step("stepOut") },
    { id: "debug.stop", title: "Debug: stop (<Space>dq)", run: () => void c.dbg.stop() },
    { id: "debug.output", title: "Debug: show the program's output (<Space>dl)", run: () => void c.ed.showOutput() },
  ];
}
