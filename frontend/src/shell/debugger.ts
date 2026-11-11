import { pickAdapter } from "../debug/adapters";
import { DapClient, type Transport } from "../debug/dap";
import { DebugSession, type DebugState, type Step } from "../debug/session";
import { scopeRow, toggle, type Row } from "../debug/variables";

// The debugger as the workbench uses it: one session at a time, its stops shown in the editor, its output in a
// buffer, its state in the status line. The editor is behind a small interface so this runs in tests.
export interface DebugEditor {
  breakpoints(): Record<string, number[]>;
  // The workspace-relative path of the file in the active editor, null if there is none (or it is outside the folder).
  activePath(): string | null;
  openAt(path: string, line: number, col: number): Promise<void>;
  setDebugLine(path: string | null, line?: number): void;
  appendOutput(text: string): Promise<void>;
}

export type DebugStatus = "idle" | DebugState;

export class Debugger {
  private session: DebugSession | null = null;

  constructor(
    private root: string,
    private ed: DebugEditor,
    private connect: (adapter: string) => Transport,
    private onStatus: (s: DebugStatus) => void,
    private say: (text: string) => void,
  ) {}

  get status(): DebugStatus { return this.session?.state ?? "idle"; }
  get frames() { return this.session?.frames ?? []; }

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

  // The stopped program's scopes as rows to open: Locals and Arguments come open, the expensive ones (Globals) closed.
  // null: nothing is stopped.
  async variables(): Promise<Row[] | null> {
    const s = this.session;
    if (!s || s.state !== "paused") return null;
    const scopes = await s.scopes();
    const rows = scopes.map(scopeRow);
    for (let i = 0; i < rows.length; i++) {
      if (!scopes[i].expensive) await toggle(rows[i], (ref) => s.variables(ref));
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

  // A breakpoint changed in path while a session lives: the adapter gets the file's new lines.
  breakpointsChanged(path: string, lines: number[]) {
    if (this.session && this.session.state !== "ended") void this.session.breakpoints(path, lines).catch(() => {});
  }
}
