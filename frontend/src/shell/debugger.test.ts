import { expect, test } from "vitest";
import { fakeAdapter } from "../debug/fakeAdapter";
import { Debugger, type DebugEditor, type DebugStatus } from "./debugger";

const tick = () => new Promise((r) => setTimeout(r, 10));

function setup(breakpoints: Record<string, number[]> = { "main.go": [6] }) {
  const log: string[] = [];
  const statuses: DebugStatus[] = [];
  const ed: DebugEditor = {
    breakpoints: () => breakpoints,
    activeGoDir: () => null,
    openAt: async (path, line) => void log.push(`open ${path}:${line}`),
    setDebugLine: (path, line) => void log.push(`line ${path ?? "none"}${path ? `:${line}` : ""}`),
    appendOutput: async (text) => void log.push(`out ${text.trim()}`),
  };
  const f = fakeAdapter({
    answer: (m) => (m.command === "stackTrace"
      ? { stackFrames: [{ id: 1, name: "main", line: 6, column: 1, source: { path: "/p/main.go" } }] }
      : undefined),
    closeOnDisconnect: true,
  });
  const said: string[] = [];
  const dbg = new Debugger("/p", ed, () => f.transport, (s) => statuses.push(s), (t) => said.push(t));
  return { f, log, statuses, said, dbg };
}

test("start sends the loaded buffers' breakpoints; a stop opens the file at the line and marks it", async () => {
  const { f, log, statuses, dbg } = setup();
  await dbg.start();
  expect(f.requests.find((r) => r.command === "setBreakpoints")?.arguments.breakpoints).toEqual([{ line: 6 }]);
  expect(statuses).toEqual(["starting", "running"]);
  f.push({ type: "event", event: "stopped", body: { reason: "breakpoint", threadId: 1 } });
  await tick();
  expect(statuses[statuses.length - 1]).toBe("paused");
  expect(log).toEqual(["open main.go:6", "line main.go:6"]);
});

test("stepping clears the marked line, sends the step, and says so when the program runs or nothing debugs", async () => {
  const { f, log, said, dbg } = setup();
  await dbg.step("next");
  expect(said.pop()).toContain("Not debugging");
  await dbg.start();
  await dbg.step("next");
  expect(said.pop()).toContain("running");
  f.push({ type: "event", event: "stopped", body: { reason: "breakpoint", threadId: 2 } });
  await tick();
  log.length = 0;
  await dbg.step("stepIn");
  expect(log).toEqual(["line none"]);
  expect(f.requests[f.requests.length - 1]).toEqual({ command: "stepIn", arguments: { threadId: 2 } });
});

test("program output goes to the buffer; the end clears the line and the status goes back to idle", async () => {
  const { f, log, statuses, dbg } = setup();
  await dbg.start();
  f.push({ type: "event", event: "output", body: { category: "stdout", output: "i = 3\n" } });
  f.push({ type: "event", event: "terminated" });
  await tick();
  expect(log).toEqual(["out i = 3", "line none"]);
  expect(statuses.slice(-2)).toEqual(["ended", "idle"]);
  expect(dbg.status).toBe("idle");
});

test("a second start while debugging is refused; after stop it works again", async () => {
  const { said, dbg, f } = setup();
  await dbg.start();
  await dbg.start();
  expect(said.pop()).toContain("Already debugging");
  await dbg.stop();
  expect(f.got).toContain("disconnect");
  expect(dbg.status).toBe("idle");
});

test("breakpoints changed while debugging reach the adapter; with no session nothing is sent", async () => {
  const { f, dbg } = setup();
  dbg.breakpointsChanged("main.go", [1]);
  expect(f.requests).toEqual([]);
  await dbg.start();
  dbg.breakpointsChanged("main.go", [1, 2]);
  await tick();
  expect(f.requests[f.requests.length - 1].arguments.breakpoints).toEqual([{ line: 1 }, { line: 2 }]);
});

test("a failed launch rejects and leaves the debugger idle", async () => {
  const f = fakeAdapter({ failLaunch: true });
  const statuses: DebugStatus[] = [];
  const nothing = async () => {};
  const ed: DebugEditor = { breakpoints: () => ({}), activeGoDir: () => null, openAt: nothing, setDebugLine: () => {}, appendOutput: nothing };
  const dbg = new Debugger("/p", ed, () => f.transport, (s) => statuses.push(s), () => {});
  await expect(dbg.start()).rejects.toThrow("could not launch process");
  expect(dbg.status).toBe("idle");
  expect(statuses[statuses.length - 1]).toBe("idle");
});

test("variables: nothing while running; when stopped Locals comes open and Globals (expensive) stays closed", async () => {
  const f = fakeAdapter({
    answer: (m) => {
      if (m.command === "stackTrace") {
        return { stackFrames: [{ id: 9, name: "main", line: 6, column: 1, source: { path: "/p/main.go" } }] };
      }
      if (m.command === "scopes") {
        const globals = { name: "Globals", variablesReference: 2, expensive: true };
        return { scopes: [{ name: "Locals", variablesReference: 1 }, globals] };
      }
      if (m.command === "variables") {
        const i = { name: "i", value: "3", type: "int", variablesReference: 0 };
        return { variables: m.arguments.variablesReference === 1 ? [i] : [] };
      }
      return undefined;
    },
  });
  const nothing = async () => {};
  const ed: DebugEditor = { breakpoints: () => ({}), activeGoDir: () => null, openAt: nothing, setDebugLine: () => {}, appendOutput: nothing };
  const dbg = new Debugger("/p", ed, () => f.transport, () => {}, () => {});
  await dbg.start();
  expect(await dbg.variables()).toBeNull(); // running
  f.push({ type: "event", event: "stopped", body: { reason: "breakpoint", threadId: 1 } });
  await tick();
  const rows = (await dbg.variables())!;
  const summary = rows.map((r) => [r.name, r.open, r.children?.map((c) => c.name)]);
  expect(summary).toEqual([["Locals", true, ["i"]], ["Globals", false, undefined]]);
  expect(f.requests.find((r) => r.command === "scopes")?.arguments).toEqual({ frameId: 9 });
  await dbg.toggleRow(rows[1]); // opening Globals loads it then
  expect(rows[1].open).toBe(true);
  expect(f.requests[f.requests.length - 1]).toEqual({ command: "variables", arguments: { variablesReference: 2 } });
});
