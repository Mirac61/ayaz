// Command registry (ADR-0010): every action has an ID; keymaps, ex commands and the palette only name IDs.

export interface Command {
  id: string;
  title: string; // shown in the palette
  // arg comes from a binding or an ex command (":e foo" → "foo", ":w!" → "!").
  run(arg?: string): unknown;
}

export class Commands {
  private m = new Map<string, Command>();

  // Returns a function that unregisters them again.
  register(...cs: Command[]): () => void {
    for (const c of cs) {
      if (this.m.has(c.id)) throw new Error(`command ${c.id} registered twice`);
      this.m.set(c.id, c);
    }
    return () => cs.forEach((c) => this.m.get(c.id) === c && this.m.delete(c.id));
  }

  has(id: string) { return this.m.has(id); }
  list() { return [...this.m.values()].sort((a, b) => a.title.localeCompare(b.title)); }

  run(id: string, arg?: string): unknown {
    const c = this.m.get(id);
    if (!c) throw new Error(`unknown command: ${id}`);
    return c.run(arg);
  }
}
