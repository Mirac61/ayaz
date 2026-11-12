import { goAdapter, type DebugAdapter } from "./adapters";

// A small Debug Adapter Protocol client: JSON messages with seq, type and command or event. No package: the protocol
// is this thin. The transport carries bare JSON texts; Go does the Content-Length framing (internal/dap).

export interface Transport {
  send(json: string): void;
  onMessage(fn: (json: string) => void): void;
  onClose(fn: () => void): void;
  close(): void;
}

interface Message {
  seq: number;
  type: "request" | "response" | "event";
  command?: string; // request, response
  event?: string; // event
  request_seq?: number; // response
  success?: boolean; // response
  message?: string; // a failed response
  body?: unknown;
  arguments?: unknown;
}

type Listener = (body: any) => void;

export interface RunInTerminalArgs {
  kind?: "integrated" | "external";
  title?: string;
  cwd?: string;
  args: string[];
  env?: Record<string, string>;
  argsCanBeMultivalued?: boolean;
}

export class DapClient {
  private seq = 1;
  private pending = new Map<number, { resolve(body: unknown): void; reject(e: Error): void; command: string }>();
  private listeners = new Map<string, Set<Listener>>();
  private done = false;
  onRunInTerminal?: (args: RunInTerminalArgs) => Promise<{ processId?: number; shellProcessId?: number } | void>;

  constructor(private t: Transport) {
    t.onMessage((raw) => this.handle(JSON.parse(raw) as Message));
    t.onClose(() => this.end("The debug adapter ended"));
  }

  // Sends a request; resolves with the response's body, rejects with the adapter's message when it says no.
  request<T = unknown>(command: string, args?: object): Promise<T> {
    if (this.done) return Promise.reject(new Error("The debug adapter ended"));
    const seq = this.seq++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(seq, { resolve: resolve as (b: unknown) => void, reject, command });
      this.t.send(JSON.stringify({ seq, type: "request", command, ...(args && { arguments: args }) }));
    });
  }

  // Calls fn with the body of each event of that name ("*": every event, with the name in front). Returns the unsubscribe.
  on(event: string, fn: Listener): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(fn);
    this.listeners.set(event, set);
    return () => void set.delete(fn);
  }

  // Resolves with the body of the next event of that name.
  next<T = unknown>(event: string): Promise<T> {
    return new Promise((resolve) => {
      const off = this.on(event, (body) => {
        off();
        resolve(body as T);
      });
    });
  }

  close() {
    this.end("The debug session was closed");
    this.t.close();
  }

  private end(why: string) {
    if (this.done) return;
    this.done = true;
    for (const p of this.pending.values()) p.reject(new Error(why));
    this.pending.clear();
    this.emit("closed", { reason: why });
  }

  private handle(m: Message) {
    if (m.type === "response") {
      const p = this.pending.get(m.request_seq ?? -1);
      if (!p) return;
      this.pending.delete(m.request_seq!);
      if (m.success) p.resolve(m.body);
      else p.reject(new Error(m.message || `${p.command} failed`));
    } else if (m.type === "event") {
      this.emit(m.event ?? "", m.body);
    } else if (m.type === "request") {
      const seq = this.seq++;
      if (m.command === "runInTerminal" && this.onRunInTerminal) {
        this.onRunInTerminal(m.arguments as RunInTerminalArgs).then(
          (body) => {
            const resp = { seq, type: "response", request_seq: m.seq, command: m.command, success: true, body: body ?? {} };
            this.t.send(JSON.stringify(resp));
          },
          (err) => {
            const resp = { seq, type: "response", request_seq: m.seq, command: m.command, success: false, message: err instanceof Error ? err.message : String(err) };
            this.t.send(JSON.stringify(resp));
          },
        );
      } else {
        const refusal = { seq, type: "response", request_seq: m.seq, command: m.command, success: false, message: "not supported" };
        this.t.send(JSON.stringify(refusal));
      }
    }
  }

  private emit(event: string, body: unknown) {
    this.listeners.get(event)?.forEach((fn) => fn(body));
    this.listeners.get("*")?.forEach((fn) => fn({ event, body }));
  }
}

// What the debugger shows of a stopped program.
export interface Breakpoint {
  line: number;
  condition?: string;
  logMessage?: string;
  hitCondition?: string;
}
export interface StackFrame { id: number; name: string; line: number; column: number; source?: { path?: string; name?: string } }
export interface Scope { name: string; variablesReference: number; expensive?: boolean }
export interface Variable { name: string; value: string; type?: string; variablesReference: number }
export interface StoppedEvent {
  reason: string; threadId?: number; allThreadsStopped?: boolean; description?: string; text?: string;
}
export interface OutputEvent { category?: string; output: string }

export interface LaunchOptions {
  root: string; // absolute path of the folder
  program?: string; // absolute path of what the adapter debugs (for Go the package folder); the folder's own by default
  adapter?: DebugAdapter; // Go (Delve) by default
  breakpoints: Record<string, (number | Breakpoint)[]>; // workspace-relative path → breakpoints or lines (1-based)
}

// Starts debugging program (the folder's root by default): initialize, launch, then (after the adapter says "initialized")
// the breakpoints, then configurationDone. Delve answers launch only after configurationDone, so it isn't awaited first.
export async function launch(client: DapClient, opts: LaunchOptions): Promise<void> {
  const adapter = opts.adapter ?? goAdapter;
  await client.request("initialize", {
    clientID: "ayaz", clientName: "Ayaz", adapterID: adapter.adapterId, linesStartAt1: true, columnsStartAt1: true, pathFormat: "path",
    supportsVariableType: true,
    supportsRunInTerminalRequest: true,
  });
  const initialized = client.next("initialized");
  const launched = client.request("launch", adapter.launch(opts.program ?? opts.root, opts.root));
  await Promise.race([initialized, launched]); // a failed launch answers before "initialized"
  for (const [path, lines] of Object.entries(opts.breakpoints)) {
    await setBreakpoints(client, opts.root, path, lines);
  }
  await client.request("configurationDone");
  await launched;
}

// The same breakpoints again for one file (the user toggled one while the program runs or is stopped).
export function setBreakpoints(client: DapClient, root: string, path: string, bps: (number | Breakpoint)[]) {
  return client.request("setBreakpoints", {
    source: { path: `${root}/${path}` },
    breakpoints: bps.map((b) => (typeof b === "number" ? { line: b } : {
      line: b.line,
      ...(b.condition && { condition: b.condition }),
      ...(b.logMessage && { logMessage: b.logMessage }),
      ...(b.hitCondition && { hitCondition: b.hitCondition }),
    })),
  });
}
