import type { Transport } from "./dap";

interface FakeOptions {
  failLaunch?: boolean;
  // Answers the requests the script knows (stackTrace, threads, next, ...): returns the response body, or undefined
  // for "no special answer". Called with the whole request.
  answer?: (m: { command: string; arguments?: any }) => object | undefined;
  // What the adapter says when it gets disconnect: it ends the connection, like Delve.
  closeOnDisconnect?: boolean;
}

// A scripted adapter: answers requests like Delve does (launch is answered only after configurationDone, and
// "initialized" comes after launch arrives), records what it got, and lets the test push events.
export function fakeAdapter(opts: FakeOptions = {}) {
  const got: string[] = [];
  const requests: { command: string; arguments?: any }[] = [];
  let toClient: (json: string) => void = () => {};
  let closed: () => void = () => {};
  let launchSeq = 0;
  const reply = (o: object) => queueMicrotask(() => toClient(JSON.stringify(o)));
  const response = (m: any, rest: object) => reply({ seq: 0, type: "response", request_seq: m.seq, command: m.command, ...rest });
  const respond = (m: any, body?: object) => response(m, { success: true, body });
  const transport: Transport = {
    send(raw) {
      const m = JSON.parse(raw);
      if (m.type !== "request") return void got.push(`${m.type}:${m.command}:${m.success}`);
      got.push(m.command);
      requests.push({ command: m.command, arguments: m.arguments });
      const special = opts.answer?.(m);
      if (m.command === "initialize") respond(m, { supportsConfigurationDoneRequest: true });
      else if (m.command === "launch") {
        launchSeq = m.seq;
        if (opts.failLaunch) response(m, { success: false, message: "could not launch process" });
        else reply({ seq: 0, type: "event", event: "initialized" });
      } else if (m.command === "setBreakpoints") {
        respond(m, { breakpoints: m.arguments.breakpoints.map((b: { line: number }) => ({ verified: true, line: b.line })) });
      } else if (m.command === "configurationDone") {
        respond(m);
        reply({ seq: 0, type: "response", request_seq: launchSeq, command: "launch", success: true });
      } else if (m.command === "disconnect") {
        respond(m);
        if (opts.closeOnDisconnect) queueMicrotask(() => closed());
      } else respond(m, special ?? {});
    },
    onMessage: (fn) => { toClient = fn; },
    onClose: (fn) => { closed = fn; },
    close: () => closed(),
  };
  return { transport, got, requests, push: (o: object) => reply({ seq: 0, ...o }), die: () => closed() };
}
