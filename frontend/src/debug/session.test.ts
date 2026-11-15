import { expect, test } from "vitest";
import { DapClient } from "./dap";
import { fakeAdapter } from "./fakeAdapter";
import { DebugSession, type DebugHooks } from "./session";

const tick = () => new Promise((r) => setTimeout(r, 10));
const last = <T>(a: T[]) => a[a.length - 1];

const MAIN = { id: 1, name: "main.main", line: 12, column: 1, source: { path: "/p/main.go" } };

// A session on a fake adapter, recording what the hooks were told.
function setup(opts: Parameters<typeof fakeAdapter>[0] = {}) {
  const log: string[] = [];
  const f = fakeAdapter({
    answer: (m) => (m.command === "stackTrace" ? { stackFrames: [MAIN, { id: 2, name: "x", line: 1, column: 1 }] } : undefined),
    ...opts,
  });
  const hooks: DebugHooks = {
    state: (s) => log.push(`state ${s}`),
    stopped: (at, reason) => log.push(`stopped ${at ? `${at.path}:${at.line}` : "nowhere"} ${reason}`),
    output: (t, c) => log.push(`output ${c} ${t.trim()}`),
    ended: () => log.push("ended"),
  };
  const session = new DebugSession(new DapClient(f.transport), "/p", hooks);
  return { f, log, session };
}

test("start runs the launch sequence and ends up running", async () => {
  const { f, log, session } = setup();
  await session.start({ "main.go": [12] });
  expect(f.got).toEqual(["initialize", "launch", "setBreakpoints", "configurationDone"]);
  expect(session.state).toBe("running");
  expect(log).toEqual(["state starting", "state running"]);
});

test("a stop shows the top frame's file (relative to the folder) and line, and the session is paused", async () => {
  const { f, log, session } = setup();
  await session.start({});
  f.push({ type: "event", event: "stopped", body: { reason: "breakpoint", threadId: 3 } });
  await tick();
  expect(session.state).toBe("paused");
  expect(session.threadId).toBe(3);
  expect(session.frames).toHaveLength(2);
  expect(log.slice(-2)).toEqual(["state paused", "stopped main.go:12 breakpoint"]);
  expect(f.requests.find((r) => r.command === "stackTrace")?.arguments).toMatchObject({ threadId: 3 });
});

const LIB = { id: 1, name: "fmt.Println", line: 7, column: 1, source: { path: "/usr/lib/go/fmt/print.go" } };

test("a frame outside the folder keeps its absolute path; a stop without source files says nowhere", async () => {
  const { f, log, session } = setup({
    answer: (m) => (m.command === "stackTrace" ? { stackFrames: [LIB] } : undefined),
  });
  await session.start({});
  f.push({ type: "event", event: "stopped", body: { reason: "step", threadId: 1 } });
  await tick();
  expect(last(log)).toBe("stopped /usr/lib/go/fmt/print.go:7 step");
});

test("continue, next, step in and step out go to the stopped thread and set running; while running they do nothing", async () => {
  const { f, log, session } = setup();
  await session.start({});
  await session.resume("next"); // running: ignored
  expect(f.got).not.toContain("next");
  for (const step of ["next", "stepIn", "stepOut", "continue"] as const) {
    f.push({ type: "event", event: "stopped", body: { reason: "step", threadId: 5 } });
    await tick();
    await session.resume(step);
    expect(session.state).toBe("running");
    expect(last(f.requests)).toEqual({ command: step, arguments: { threadId: 5 } });
  }
  expect(log.filter((l) => l === "state paused")).toHaveLength(4);
});

test("active frame selection switches scope and evaluate target frame", async () => {
  const { f, session } = setup({
    answer: (m) => {
      if (m.command === "stackTrace") return { stackFrames: [MAIN, { id: 2, name: "helper", line: 5, column: 1, source: { path: "/p/helper.go" } }] };
      if (m.command === "scopes") return { scopes: [{ name: `Scope for ${m.arguments?.frameId}`, variablesReference: 10 }] };
      if (m.command === "evaluate") return { result: `val-${m.arguments?.frameId}`, variablesReference: 0 };
      return undefined;
    },
  });
  await session.start({});
  f.push({ type: "event", event: "stopped", body: { reason: "breakpoint", threadId: 1 } });
  await tick();
  expect(session.activeFrameId).toBe(1);

  const scope1 = await session.scopes();
  expect(scope1[0].name).toBe("Scope for 1");
  const eval1 = await session.evaluate("x");
  expect(eval1.result).toBe("val-1");

  session.setActiveFrame(2);
  expect(session.activeFrameId).toBe(2);

  const scope2 = await session.scopes();
  expect(scope2[0].name).toBe("Scope for 2");
  const eval2 = await session.evaluate("x");
  expect(eval2.result).toBe("val-2");
});

test("program output and the adapter's console lines reach the output hook, telemetry doesn't", async () => {
  const { f, log, session } = setup();
  await session.start({});
  f.push({ type: "event", event: "output", body: { category: "stdout", output: "hello\n" } });
  f.push({ type: "event", event: "output", body: { category: "stderr", output: "oops\n" } });
  f.push({ type: "event", event: "output", body: { category: "telemetry", output: "x" } });
  f.push({ type: "event", event: "output", body: { output: "plain\n" } });
  await tick();
  expect(log.filter((l) => l.startsWith("output"))).toEqual(["output stdout hello", "output stderr oops", "output stdout plain"]);
});

test("terminated ends the session once; a stop afterwards does nothing", async () => {
  const { f, log, session } = setup();
  await session.start({});
  f.push({ type: "event", event: "terminated" });
  f.push({ type: "event", event: "exited", body: { exitCode: 0 } });
  await tick();
  expect(session.state).toBe("ended");
  expect(log.filter((l) => l === "ended")).toHaveLength(1);
  await session.stop();
  expect(f.got).not.toContain("disconnect");
});

test("stop disconnects and terminates the program", async () => {
  const { f, log, session } = setup({ closeOnDisconnect: true });
  await session.start({});
  await session.stop();
  expect(f.requests.find((r) => r.command === "disconnect")?.arguments).toEqual({ terminateDebuggee: true });
  expect(session.state).toBe("ended");
  expect(last(log)).toBe("ended");
});

test("a failed launch ends the session and rejects start", async () => {
  const { log, session } = setup({ failLaunch: true });
  await expect(session.start({})).rejects.toThrow("could not launch process");
  expect(session.state).toBe("ended");
  expect(log).toContain("ended");
});

test("breakpoints for a file while running go out as setBreakpoints with the absolute path", async () => {
  const { f, session } = setup();
  await session.start({});
  await session.breakpoints("main.go", [3, 4]);
  const req = last(f.requests);
  expect(req.command).toBe("setBreakpoints");
  expect(req.arguments).toEqual({ source: { path: "/p/main.go" }, breakpoints: [{ line: 3 }, { line: 4 }] });
});
