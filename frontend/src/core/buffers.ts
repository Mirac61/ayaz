import type { EditorState, Text } from "@codemirror/state";
import type { Files } from "./backend";

export interface Buffer {
  path: string;
  state: EditorState;
  mtime: number; // mtime the buffer was read or last written with, 0 = not on disk yet
  saved: Text; // doc as on disk, for the dirty flag
}

export const isDirty = (b: Buffer) => !b.state.doc.eq(b.saved);

const notFound = (e: unknown) => /no such file/i.test(String(e));

// What a change on disk means for a loaded buffer. "reload": a clean buffer should take the new content.
export type DiskState = { kind: "same" | "deleted" | "conflict" } | { kind: "reload"; content: string; mtime: number };

// The smallest single replacement that turns a into b, so cursors and folds outside it stay put.
export function diff(a: string, b: string) {
  let s = 0, e = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  return { from: s, to: a.length - e, insert: b.slice(s, b.length - e) };
}

// Open files of one workspace. Buffers stay loaded when you switch away (nvim's `hidden`).
export class Buffers {
  private m = new Map<string, Buffer>();

  constructor(
    private files: Files,
    private makeState: (path: string, doc: string) => Promise<EditorState>,
  ) {}

  get(path: string) { return this.m.get(path); }
  list() { return [...this.m.values()]; }
  dirty() { return this.list().filter(isDirty); }
  // Forgets a buffer whose file was renamed or trashed.
  drop(path: string) { this.m.delete(path); }

  // Returns the loaded buffer, or reads the file. A missing file gives an empty new buffer (like `:e new.txt`).
  async open(path: string): Promise<Buffer> {
    return this.m.get(path) ?? this.load(path);
  }

  // Re-reads from disk and drops unsaved changes (`:e!`).
  async load(path: string): Promise<Buffer> {
    let content = "", mtime = 0;
    try {
      ({ content, mtime } = await this.files.readText(path));
    } catch (e) {
      if (!notFound(e)) throw e;
    }
    const state = await this.makeState(path, content);
    const b: Buffer = { path, state, mtime, saved: state.doc };
    this.m.set(path, b);
    return b;
  }

  // Compares the buffer with disk after a watcher event. A dirty buffer that matches disk becomes clean.
  async checkDisk(b: Buffer): Promise<DiskState> {
    let f;
    try {
      f = await this.files.readText(b.path);
    } catch (e) {
      if (!notFound(e)) throw e;
      return { kind: b.mtime ? "deleted" : "same" };
    }
    if (f.mtime === b.mtime) return { kind: "same" };
    if (f.content === b.state.doc.toString()) {
      b.mtime = f.mtime;
      b.saved = b.state.doc;
      return { kind: "same" };
    }
    if (isDirty(b)) return { kind: "conflict" };
    return { kind: "reload", content: f.content, mtime: f.mtime };
  }

  // Writes the buffer. Without force, a file changed on disk since reading rejects ("file changed on disk").
  async save(b: Buffer, force = false): Promise<void> {
    const doc = b.state.doc;
    let expected = b.mtime;
    if (force) expected = await this.files.readText(b.path).then((f) => f.mtime, (e) => (notFound(e) ? 0 : Promise.reject(e)));
    b.mtime = await this.files.writeText(b.path, doc.toString(), expected);
    b.saved = doc;
  }
}
