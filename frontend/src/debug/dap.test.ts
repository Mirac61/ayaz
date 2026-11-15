import { expect, test } from "vitest";
import { DapClient, launch } from "./dap";
import { fakeAdapter as fake } from "./fakeAdapter";

test("launch: initialize, launch, then breakpoints per file, then configurationDone, then the launch answer", async () => {
  const f = fake();
  const client = new DapClient(f.transport);
  await launch(client, { root: "/p", breakpoints: { "main.go": [5, 9], "util/x.go": [2] } });
  expect(f.got).toEqual(["initialize", "launch", "setBreakpoints", "setBreakpoints", "configurationDone"]);
});

test("the breakpoints go out as absolute paths with their lines", async () => {
  const f = fake();
  const sent: any[] = [];
  const raw = f.transport.send;
  f.transport.send = (j) => { sent.push(JSON.parse(j)); raw(j); };
  await launch(new DapClient(f.transport), { root: "/p", breakpoints: { "main.go": [5, 9] } });
  const bp = sent.find((m) => m.command === "setBreakpoints");
  expect(bp.arguments).toEqual({ source: { path: "/p/main.go" }, breakpoints: [{ line: 5 }, { line: 9 }] });
  expect(sent.find((m) => m.command === "launch").arguments).toEqual({ mode: "debug", program: "/p", cwd: "/p", console: "integratedTerminal" });
});

test("conditional breakpoints, logpoints and hitCondition are forwarded in setBreakpoints", async () => {
  const f = fake();
  const sent: any[] = [];
  const raw = f.transport.send;
  f.transport.send = (j) => { sent.push(JSON.parse(j)); raw(j); };
  await launch(new DapClient(f.transport), {
    root: "/p",
    breakpoints: {
      "main.go": [
        { line: 5, condition: "i == 2" },
        { line: 8, logMessage: "log here" },
        { line: 12, hitCondition: "5" },
      ],
    },
  });
  const bp = sent.find((m) => m.command === "setBreakpoints");
  expect(bp.arguments).toEqual({
    source: { path: "/p/main.go" },
    breakpoints: [
      { line: 5, condition: "i == 2" },
      { line: 8, logMessage: "log here" },
      { line: 12, hitCondition: "5" },
    ],
  });
});

test("events reach their listeners: stopped, output, terminated; * sees all; the unsubscribe works", async () => {
  const f = fake();
  const client = new DapClient(f.transport);
  const seen: string[] = [];
  const off = client.on("stopped", (b) => seen.push(`stopped ${b.reason} ${b.threadId}`));
  client.on("output", (b) => seen.push(`output ${b.output.trim()}`));
  client.on("*", (e) => seen.push(`* ${e.event}`));
  f.push({ type: "event", event: "stopped", body: { reason: "breakpoint", threadId: 1 } });
  f.push({ type: "event", event: "output", body: { output: "hello\n" } });
  await new Promise((r) => setTimeout(r, 10));
  off();
  f.push({ type: "event", event: "stopped", body: { reason: "step", threadId: 1 } });
  f.push({ type: "event", event: "terminated" });
  await new Promise((r) => setTimeout(r, 10));
  expect(seen).toEqual(["stopped breakpoint 1", "* stopped", "output hello", "* output", "* stopped", "* terminated"]);
});

test("a failed request rejects with the adapter's message; a failed launch ends launch()", async () => {
  const f = fake({ failLaunch: true });
  const client = new DapClient(f.transport);
  await expect(launch(client, { root: "/p", breakpoints: {} })).rejects.toThrow("could not launch process");
});

test("when the adapter goes, pending requests reject and 'closed' fires; later requests reject at once", async () => {
  const f = fake();
  const client = new DapClient(f.transport);
  const closed = client.next("closed");
  const hung = client.request("evaluate"); // answered by respond(): make it hang instead
  f.transport.send = () => {};
  const never = client.request("threads");
  f.die();
  await expect(never).rejects.toThrow("ended");
  await expect(closed).resolves.toEqual({ reason: "The debug adapter ended" });
  await expect(client.request("next")).rejects.toThrow("ended");
  await hung.catch(() => {});
});

test("a request from the adapter gets an answer saying no", async () => {
  const f = fake();
  new DapClient(f.transport);
  f.push({ type: "request", seq: 7, command: "runInTerminal", arguments: {} });
  await new Promise((r) => setTimeout(r, 10));
  expect(f.got).toEqual(["response:runInTerminal:false"]);
});

test("a runInTerminal request from the adapter is handled when onRunInTerminal is set", async () => {
  const f = fake();
  const client = new DapClient(f.transport);
  let handledArgs: any = null;
  client.onRunInTerminal = async (args) => {
    handledArgs = args;
    return { processId: 4321 };
  };
  f.push({ type: "request", seq: 8, command: "runInTerminal", arguments: { args: ["./prog"], cwd: "/p" } });
  await new Promise((r) => setTimeout(r, 10));
  expect(handledArgs).toEqual({ args: ["./prog"], cwd: "/p" });
  expect(f.got).toEqual(["response:runInTerminal:true"]);
});
