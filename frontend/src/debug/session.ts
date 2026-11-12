import type { DebugAdapter } from "./adapters";
import {
  DapClient, launch, setBreakpoints, type Breakpoint, type OutputEvent, type Scope, type StackFrame, type StoppedEvent, type Variable,
} from "./dap";

// One debugging session: starting, the program stopping and running again, stepping, ending. The editor side
// (which file, which line, what the status line says) hangs on the hooks, so this stays testable without one.

export type DebugState = "starting" | "running" | "paused" | "ended";

export interface DebugHooks {
  state(s: DebugState): void;
  // The program stopped: its top frame, in a file of the folder (workspace-relative path) or elsewhere (absolute).
  stopped(at: { path: string; line: number } | null, reason: string): void;
  output(text: string, category: string): void;
  ended(): void;
}

export type Step = "continue" | "next" | "stepIn" | "stepOut";

export class DebugSession {
  state: DebugState = "starting";
  threadId = 0;
  frames: StackFrame[] = []; // of the thread that stopped, innermost first

  constructor(readonly client: DapClient, readonly root: string, private hooks: DebugHooks) {
    client.on("stopped", (b: StoppedEvent) => void this.onStopped(b));
    client.on("continued", () => this.set("running"));
    client.on("output", (b: OutputEvent) => {
      // Delve also sends "telemetry" and the like; the program's own text and the adapter's console lines are shown.
      const shown = !b.category || ["stdout", "stderr", "console"].includes(b.category);
      if (b.output && shown) this.hooks.output(b.output, b.category ?? "stdout");
    });
    client.on("terminated", () => this.end());
    client.on("exited", () => this.end());
    client.on("closed", () => this.end());
  }

  // Launches program (an absolute path, the root's own by default) with these breakpoints (workspace-relative path
  // → breakpoints or lines). Rejects if launching fails.
  async start(breakpoints: Record<string, (number | Breakpoint)[]>, program?: string, adapter?: DebugAdapter) {
    this.hooks.state("starting");
    try {
      await launch(this.client, { root: this.root, program, adapter, breakpoints });
    } catch (e) {
      this.end();
      throw e;
    }
    if (this.state === "starting") this.set("running");
  }

  async resume(step: Step) {
    if (this.state !== "paused") return;
    this.set("running");
    await this.client.request(step, { threadId: this.threadId });
  }

  // The scopes of the innermost frame (arguments, locals, globals) while the program is stopped; [] otherwise.
  async scopes(): Promise<Scope[]> {
    const frame = this.frames[0];
    if (this.state !== "paused" || !frame) return [];
    const res = await this.client.request<{ scopes?: Scope[] }>("scopes", { frameId: frame.id });
    return res.scopes ?? [];
  }

  // The children of a scope or variable.
  async variables(ref: number): Promise<Variable[]> {
    return (await this.client.request<{ variables: Variable[] }>("variables", { variablesReference: ref })).variables;
  }

  // Evaluates expr in the context of the innermost frame (or without a frame if none).
  async evaluate(expression: string, context: "watch" | "hover" | "repl" = "watch"): Promise<{ result: string; type?: string; variablesReference: number }> {
    const frame = this.frames[0];
    const args: { expression: string; context: string; frameId?: number } = { expression, context };
    if (frame) args.frameId = frame.id;
    return this.client.request<{ result: string; type?: string; variablesReference: number }>("evaluate", args);
  }

  watch(expression: string) {
    return this.evaluate(expression, "watch");
  }

  // New breakpoints for one file while the program runs or is stopped.
  breakpoints(path: string, bps: (number | Breakpoint)[]) {
    return this.state === "ended" ? Promise.resolve() : setBreakpoints(this.client, this.root, path, bps).then(() => {});
  }

  // Ends the program and the session.
  async stop() {
    if (this.state === "ended") return;
    await this.client.request("disconnect", { terminateDebuggee: true }).catch(() => {});
    this.client.close();
    this.end();
  }

  private set(s: DebugState) {
    if (this.state === "ended" || this.state === s) return;
    this.state = s;
    this.hooks.state(s);
  }

  private end() {
    if (this.state === "ended") return;
    this.state = "ended";
    this.hooks.state("ended");
    this.hooks.ended();
  }

  private async onStopped(b: StoppedEvent) {
    this.threadId = b.threadId ?? this.threadId;
    this.set("paused");
    let frames: StackFrame[] = [];
    try {
      const args = { threadId: this.threadId, levels: 30 };
      frames = (await this.client.request<{ stackFrames: StackFrame[] }>("stackTrace", args)).stackFrames;
    } catch { /* the program may have moved on already: show the stop without a place */ }
    this.frames = frames;
    const top = frames.find((f) => f.source?.path);
    this.hooks.stopped(top ? { path: this.relative(top.source!.path!), line: top.line } : null, b.reason);
  }

  // A path inside the folder the way the editor names it; anything else (the standard library) stays absolute.
  relative(path: string) {
    return path.startsWith(this.root + "/") ? path.slice(this.root.length + 1) : path;
  }
}
