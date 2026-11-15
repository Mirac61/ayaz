import type { Breakpoint } from "../editor/breakpoints";
import { pickAdapter } from "../debug/adapters";
import { DapClient, type RunInTerminalArgs, type Transport } from "../debug/dap";
import { DebugSession, type DebugState, type Step } from "../debug/session";
import { scopeRow, toggle, type Row } from "../debug/variables";

// The debugger as the workbench uses it: one session at a time, its stops shown in the editor, its output in a
// buffer, its state in the status line. The editor is behind a small interface so this runs in tests.
export interface DebugEditor {
  breakpoints(): Record<string, (number | Breakpoint)[]>;
  // The workspace-relative path of the file in the active editor, null if there is none (or it is outside the folder).
  activePath(): string | null;
  openAt(path: string, line: number, col: number): Promise<void>;
  setDebugLine(path: string | null, line?: number): void;
  appendOutput(text: string): Promise<void>;
  runInTerminal?(args: RunInTerminalArgs): Promise<{ processId?: number; shellProcessId?: number } | void>;
}

export type DebugStatus = "idle" | DebugState;

export class Debugger {
  private session: DebugSession | null = null;
  private watches: string[] = [];

  constructor(
    private root: string,
    private ed: DebugEditor,
    private connect: (adapter: string) => Transport,
    private onStatus: (s: DebugStatus) => void,
    private say: (text: string) => void,
  ) {}

  get status(): DebugStatus { return this.session?.state ?? "idle"; }
  get frames() { return this.session?.frames ?? []; }
  get activeFrameId(): number { return this.session?.activeFrameId ?? 0; }
  get watchesList(): string[] { return [...this.watches]; }

  selectFrame(frameId: number) {
    this.session?.setActiveFrame(frameId);
  }

  relative(path: string): string {
    return this.session ? this.session.relative(path) : path;
  }

  addWatch(expr: string) {
    const trimmed = expr.trim();
    if (trimmed && !this.watches.includes(trimmed)) this.watches.push(trimmed);
  }

  removeWatch(expr: string) {
    this.watches = this.watches.filter((w) => w !== expr);
  }

  async evaluate(expr: string, context: "watch" | "hover" | "repl" = "watch") {
    const s = this.session;
    if (!s || s.state !== "paused") throw new Error("The program isn't stopped");
    return s.evaluate(expr, context);
  }

  // Starts debugging what the active file's adapter debugs (a Go file: its package) with the breakpoints of every loaded
  // buffer.
  async start() {
    if (this.session && this.session.state !== "ended") return this.say("Already debugging: <Space>dq stops it");
    const { adapter, target } = pickAdapter(this.ed.activePath());
    const session = (this.session = new DebugSession(new DapClient(this.connect(adapter.id)), this.root, {
      state: (s) => { if (this.session === session) this.onStatus(s); },
      stopped: (at, reason) => {
        if (!at) return this.say(`Stopped (${reason}), no source file for it`);
        this.say(`Stopped (${reason}) at ${at.path}:${at.line}`);
        void this.ed.openAt(at.path, at.line, 0).then(() => this.ed.setDebugLine(at.path, at.line), () => {});
      },
      output: (text) => void this.ed.appendOutput(text),
      ended: () => {
        this.ed.setDebugLine(null);
        if (this.session === session) this.session = null;
        this.onStatus("idle");
      },
      runInTerminal: this.ed.runInTerminal ? (args) => this.ed.runInTerminal!(args) : undefined,
    }));
    try {
      await session.start(this.ed.breakpoints(), target ? `${this.root}/${target}` : undefined, adapter);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  async step(kind: Step) {
    const s = this.session;
    if (!s || s.state === "ended") return this.say("Not debugging: <Space>dd starts");
    if (s.state !== "paused") return this.say("The program is running");
    this.ed.setDebugLine(null);
    await s.resume(kind);
  }

  // The stopped program's scopes as rows to open: Watch (if any) and Locals/Arguments come open, Globals closed.
  // null: nothing is stopped.
  async variables(): Promise<Row[] | null> {
    const s = this.session;
    if (!s || s.state !== "paused") return null;
    const scopes = await s.scopes();
    const rows = scopes.map(scopeRow);
    for (let i = 0; i < rows.length; i++) {
      if (!scopes[i].expensive) await toggle(rows[i], (ref) => s.variables(ref));
    }
    if (this.watches.length) {
      const children: Row[] = [];
      for (const expr of this.watches) {
        try {
          const res = await s.evaluate(expr, "watch");
          children.push({
            name: expr,
            value: res.result,
            type: res.type ? `${res.type} (watch)` : "watch",
            ref: res.variablesReference ?? 0,
            open: false,
            isWatch: true,
          });
        } catch (e) {
          children.push({
            name: expr,
            value: e instanceof Error ? e.message : String(e),
            type: "error",
            ref: 0,
            open: false,
            isWatch: true,
          });
        }
      }
      rows.unshift({
        name: "Watch",
        value: "",
        ref: 0,
        open: true,
        children,
        isWatchScope: true,
      });
    }
    return rows;
  }

  // Opens or closes one row (loading its children the first time).
  toggleRow(row: Row) {
    const s = this.session;
    return s ? toggle(row, (ref) => s.variables(ref)) : Promise.resolve();
  }

  // The workbench goes away (another folder, a closed window): end the session without a word.
  dispose() {
    void this.session?.stop();
  }

  async stop() {
    if (!this.session) return this.say("Not debugging");
    await this.session.stop();
  }

  // A breakpoint changed in path while a session lives: the adapter gets the file's new breakpoints.
  breakpointsChanged(path: string, bps: (number | Breakpoint)[]) {
    if (this.session && this.session.state !== "ended") void this.session.breakpoints(path, bps).catch(() => {});
  }
}
