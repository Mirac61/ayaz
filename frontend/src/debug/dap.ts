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

export class DapClient {
  private seq = 1;
  private pending = new Map<number, { resolve(body: unknown): void; reject(e: Error): void; command: string }>();
  private listeners = new Map<string, Set<Listener>>();
  private done = false;

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
      // A request from the adapter (runInTerminal): nothing here can do it, say so instead of leaving it waiting.
      const seq = this.seq++;
      const refusal = { seq, type: "response", request_seq: m.seq, command: m.command, success: false, message: "not supported" };
      this.t.send(JSON.stringify(refusal));
    }
  }

  private emit(event: string, body: unknown) {
    this.listeners.get(event)?.forEach((fn) => fn(body));
    this.listeners.get("*")?.forEach((fn) => fn({ event, body }));
  }
}

// What the debugger shows of a stopped program.
export interface StackFrame { id: number; name: string; line: number; column: number; source?: { path?: string; name?: string } }
export interface Scope { name: string; variablesReference: number; expensive?: boolean }
export interface Variable { name: string; value: string; type?: string; variablesReference: number }
export interface StoppedEvent {
  reason: string; threadId?: number; allThreadsStopped?: boolean; description?: string; text?: string;
}
export interface OutputEvent { category?: string; output: string }

export interface LaunchOptions {
  root: string; // absolute path of the folder: Delve debugs the package there
  breakpoints: Record<string, number[]>; // workspace-relative path → lines (1-based)
}

// Starts debugging the Go package in root: initialize, launch, then (after the adapter says "initialized") the
// breakpoints, then configurationDone. Delve answers launch only after configurationDone, so it isn't awaited first.
export async function launch(client: DapClient, opts: LaunchOptions): Promise<void> {
  await client.request("initialize", {
    clientID: "ayaz", clientName: "Ayaz", adapterID: "go", linesStartAt1: true, columnsStartAt1: true, pathFormat: "path",
    supportsVariableType: true,
  });
  const initialized = client.next("initialized");
  const launched = client.request("launch", { mode: "debug", program: opts.root, cwd: opts.root });
  await Promise.race([initialized, launched]); // a failed launch answers before "initialized"
  for (const [path, lines] of Object.entries(opts.breakpoints)) {
    await setBreakpoints(client, opts.root, path, lines);
  }
  await client.request("configurationDone");
  await launched;
}

// The same breakpoints again for one file (the user toggled one while the program runs or is stopped).
export function setBreakpoints(client: DapClient, root: string, path: string, lines: number[]) {
  return client.request("setBreakpoints", { source: { path: `${root}/${path}` }, breakpoints: lines.map((line) => ({ line })) });
}
