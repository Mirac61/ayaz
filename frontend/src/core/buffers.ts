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

// Open files of one workspace. Buffers stay loaded when you switch away (nvim's `hidden`).
export class Buffers {
  private m = new Map<string, Buffer>();

  constructor(
    private files: Files,
    private makeState: (path: string, doc: string) => Promise<EditorState>,
  ) {}

  get(path: string) { return this.m.get(path); }
  dirty() { return [...this.m.values()].filter(isDirty); }

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

  // Writes the buffer. Without force, a file changed on disk since reading rejects ("file changed on disk").
  async save(b: Buffer, force = false): Promise<void> {
    const doc = b.state.doc;
    let expected = b.mtime;
    if (force) expected = await this.files.readText(b.path).then((f) => f.mtime, (e) => (notFound(e) ? 0 : Promise.reject(e)));
    b.mtime = await this.files.writeText(b.path, doc.toString(), expected);
    b.saved = doc;
  }
}
