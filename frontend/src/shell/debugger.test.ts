import { expect, test } from "vitest";
import { fakeAdapter } from "../debug/fakeAdapter";
import { Debugger, type DebugEditor, type DebugStatus } from "./debugger";

const tick = () => new Promise((r) => setTimeout(r, 10));

function setup(breakpoints: Record<string, number[]> = { "main.go": [6] }) {
  const log: string[] = [];
  const statuses: DebugStatus[] = [];
  const ed: DebugEditor = {
    breakpoints: () => breakpoints,
    activePath: () => null,
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
  dbg.breakpointsChanged("main.go", [{ line: 1, condition: "x == 1" }]);
  await tick();
  expect(f.requests[f.requests.length - 1].arguments.breakpoints).toEqual([{ line: 1, condition: "x == 1" }]);
});

test("a failed launch rejects and leaves the debugger idle", async () => {
  const f = fakeAdapter({ failLaunch: true });
  const statuses: DebugStatus[] = [];
  const nothing = async () => {};
  const ed: DebugEditor = { breakpoints: () => ({}), activePath: () => null, openAt: nothing, setDebugLine: () => {}, appendOutput: nothing };
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
  const ed: DebugEditor = { breakpoints: () => ({}), activePath: () => null, openAt: nothing, setDebugLine: () => {}, appendOutput: nothing };
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

test("start picks the adapter for the active file and passes its id to connect", async () => {
  let passedAdapter = "";
  const f = fakeAdapter();
  const nothing = async () => {};
  const ed: DebugEditor = {
    breakpoints: () => ({}),
    activePath: () => "internal/foo/bar.go",
    openAt: nothing,
    setDebugLine: () => {},
    appendOutput: nothing,
  };
  const dbg = new Debugger(
    "/p",
    ed,
    (adapter) => {
      passedAdapter = adapter;
      return f.transport;
    },
    () => {},
    () => {},
  );
  await dbg.start();
  expect(passedAdapter).toBe("go");
  const launchReq = f.requests.find((r) => r.command === "launch");
  expect(launchReq?.arguments).toEqual({ mode: "debug", program: "/p/internal/foo", cwd: "/p", console: "integratedTerminal" });
  await dbg.stop();
});

test("start picks python adapter for .py files with file path as target", async () => {
  let passedAdapter = "";
  const f = fakeAdapter();
  const nothing = async () => {};
  const ed: DebugEditor = {
    breakpoints: () => ({}),
    activePath: () => "scripts/run.py",
    openAt: nothing,
    setDebugLine: () => {},
    appendOutput: nothing,
  };
  const dbg = new Debugger(
    "/p",
    ed,
    (adapter) => {
      passedAdapter = adapter;
      return f.transport;
    },
    () => {},
    () => {},
  );
  await dbg.start();
  expect(passedAdapter).toBe("python");
  const launchReq = f.requests.find((r) => r.command === "launch");
  expect(launchReq?.arguments).toEqual({ request: "launch", program: "/p/scripts/run.py", cwd: "/p", console: "integratedTerminal" });
  await dbg.stop();
});

test("start picks lldb adapter for .rs files", async () => {
  let passedAdapter = "";
  const f = fakeAdapter();
  const nothing = async () => {};
  const ed: DebugEditor = {
    breakpoints: () => ({}),
    activePath: () => "src/main.rs",
    openAt: nothing,
    setDebugLine: () => {},
    appendOutput: nothing,
  };
  const dbg = new Debugger(
    "/p",
    ed,
    (adapter) => {
      passedAdapter = adapter;
      return f.transport;
    },
    () => {},
    () => {},
  );
  await dbg.start();
  expect(passedAdapter).toBe("lldb");
  const launchReq = f.requests.find((r) => r.command === "launch");
  expect(launchReq?.arguments).toEqual({ request: "launch", program: "/p/target/debug", cwd: "/p", console: "integratedTerminal" });
  await dbg.stop();
});

test("watch expressions evaluate in the frame and prepend a Watch scope to variables", async () => {
  const { f, dbg } = setup();
  dbg.addWatch("i + 1");
  dbg.addWatch("total");
  expect(dbg.watchesList).toEqual(["i + 1", "total"]);
  await dbg.start();
  f.push({ type: "event", event: "stopped", body: { reason: "breakpoint", threadId: 1 } });
  await tick();

  const rows = await dbg.variables();
  expect(rows?.[0].name).toBe("Watch");
  expect(rows?.[0].children?.map((c) => [c.name, c.value])).toEqual([
    ["i + 1", "val(i + 1)"],
    ["total", "val(total)"],
  ]);

  dbg.removeWatch("i + 1");
  expect(dbg.watchesList).toEqual(["total"]);
});

test("evaluate calls evaluate request on the active session frame", async () => {
  const { f, dbg } = setup();
  await dbg.start();
  f.push({ type: "event", event: "stopped", body: { reason: "breakpoint", threadId: 1 } });
  await tick();

  const res = await dbg.evaluate("myVar");
  expect(res.result).toBe("val(myVar)");
});

test("runInTerminal forwards adapter request to editor", async () => {
  let terminalLaunched: any = null;
  const f = fakeAdapter();
  const nothing = async () => {};
  const ed: DebugEditor = {
    breakpoints: () => ({}),
    activePath: () => null,
    openAt: nothing,
    setDebugLine: () => {},
    appendOutput: nothing,
    runInTerminal: async (args) => {
      terminalLaunched = args;
      return { processId: 999 };
    },
  };
  const dbg = new Debugger("/p", ed, () => f.transport, () => {}, () => {});
  await dbg.start();
  f.push({ type: "request", seq: 15, command: "runInTerminal", arguments: { args: ["./main"], cwd: "/p" } });
  await tick();
  expect(terminalLaunched).toEqual({ args: ["./main"], cwd: "/p" });
  expect(f.got).toContain("response:runInTerminal:true");
});
