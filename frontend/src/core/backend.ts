// The only place that imports generated bindings or the Wails runtime (02-architecture, principle 2).
import { Application, Browser, Clipboard, Events, Stream, Window } from "@wailsio/runtime";
import { ConfigService, PingService, WorkspaceService } from "../../bindings/github.com/Mirac61/ayaz/app";
import type { HeadFile, Info, Match } from "../../bindings/github.com/Mirac61/ayaz/app";
import type { Entry, TextFile } from "../../bindings/github.com/Mirac61/ayaz/internal/workspace";
import type { Match as FileMatch } from "../../bindings/github.com/Mirac61/ayaz/internal/index";
import type { Loc } from "./quickfix";

export type { Entry, FileMatch, HeadFile, Info, Match, TextFile };

// A batch of changes on disk. Paths are workspace-relative, files or folders; rescan: events were lost, check everything.
export interface FsChange { paths: string[] | null; rescan: boolean }

// A language server's state, only "missing" so far: its command isn't in PATH.
export interface LspStatus { ws: string; lang: string; state: string; command: string }

export interface Backend {
  ping(): Promise<string>;
  matches(n: number): Promise<Match[]>;
  report(line: string): Promise<void>;
  spikeMode(): Promise<string>;
  stream(name: string): WebSocket;
  ready(): void;
  quit(): Promise<void>;
  initialWorkspace(): Promise<Info | null>;
  openFolderDialog(): Promise<Info | null>;
  openFolder(root: string): Promise<Info | null>;
  closeWorkspace(ws: string): Promise<void>; // watcher, index, shells, servers (ADR-0014)
  closeWindow(): Promise<void>; // this window; a no-op in the server build
  newWindow(): Promise<void>;
  // The user asked to close this window; the frontend decides (unsaved buffers) and calls closeWindow.
  onCloseRequest(fn: () => void): () => void;
  files(ws: string): Files;
  keymap(): Promise<string>; // the user's keymap.json, "" if none
  settings(): Promise<string>; // the user's settings.json, "" if none
  // Fuzzy-ranks a short list (recent files, buffers, commands) with the Go matcher.
  rank(items: string[], query: string, limit: number): Promise<FileMatch[]>;
  // Calls fn for changes on disk in workspace ws, also our own saves. Returns the unsubscribe function.
  onFsChanged(ws: string, fn: (c: FsChange) => void): () => void;
  onLspStatus(ws: string, fn: (s: LspStatus) => void): () => void;
  // HEAD, the index or the reflog of ws's repository moved (commit, checkout, stage); Go polls every second.
  onGitChanged(ws: string, fn: () => void): () => void;
  openURL(url: string): Promise<void>; // in the system browser
  copy(text: string): Promise<void>; // to the system clipboard
  zoom(level: number): Promise<void>; // this window's page zoom, 1 = 100 %; fails in the server build
}

// A running project search; cancel() stops it (closes the stream). done resolves with an error text, or null.
export interface Grep { done: Promise<string | null>; cancel(): void }

// File access bound to one workspace; paths are workspace-relative with "/".
export interface Files {
  list(dir: string): Promise<Entry[]>;
  readText(path: string): Promise<TextFile>;
  // Resolves to the new mtime. Rejects with "file changed on disk" if the file moved past expectedMtime.
  writeText(path: string, content: string, expectedMtime: number): Promise<number>;
  // Fuzzy file search, best first; positions index into the path's code points. ignored: include Git-ignored files.
  find(query: string, limit: number, ignored: boolean): Promise<FileMatch[]>;
  // Project search over the same files as find (ADR-0016); hits arrive in batches.
  grep(query: string, opts: { regex: boolean; ignored: boolean }, onHits: (hits: Loc[]) => void): Grep;
  create(path: string, dir: boolean): Promise<void>; // missing parent folders too; rejects if path exists
  rename(from: string, to: string): Promise<void>; // rejects if `to` exists
  trash(path: string): Promise<void>; // to the system trash
  reveal(path: string): Promise<void>; // in Finder / the file manager
  gitBranch(): Promise<string>; // "" outside a repository, a short SHA when detached
  gitHead(path: string): Promise<HeadFile>; // the file at HEAD; tracked=false for new files
  gitStatus(): Promise<Record<string, string>>; // changed, untracked and ignored paths: M A ? ! U (empty outside a repo)
}

export const backend: Backend = {
  ping: () => PingService.Ping(),
  matches: async (n) => (await PingService.Matches(n)) ?? [], // Go nil slice arrives as null
  report: (line) => PingService.Report(line),
  spikeMode: () => PingService.SpikeMode(),
  // WailsSocket implements the WebSocket subset we use.
  stream: (name) => Stream(name) as WebSocket,
  ready: () => void Events.Emit("app:ready"),
  quit: () => Application.Quit(),
  initialWorkspace: () => WorkspaceService.Initial(),
  openFolderDialog: () => WorkspaceService.OpenDialog(),
  openFolder: (root) => WorkspaceService.Open(root),
  closeWorkspace: (ws) => WorkspaceService.Close(ws),
  closeWindow: () => WorkspaceService.CloseWindow(),
  newWindow: () => WorkspaceService.NewWindow(),
  onCloseRequest: (fn) => Events.On("app:close-request", () => fn()),
  keymap: () => ConfigService.Keymap(),
  settings: () => ConfigService.Settings(),
  rank: async (items, q, limit) => (await WorkspaceService.Rank(items, q, limit)) ?? [],
  openURL: (url) => Browser.OpenURL(url),
  copy: (text) => Clipboard.SetText(text),
  zoom: (level) => Window.SetZoom(level),
  onFsChanged: (ws, fn) =>
    Events.On("fs:changed", (e: { data: FsChange & { ws: string } }) => {
      if (e.data.ws === ws) fn(e.data);
    }),
  onLspStatus: (ws, fn) =>
    Events.On("lsp:status", (e: { data: LspStatus }) => {
      if (e.data.ws === ws) fn(e.data);
    }),
  onGitChanged: (ws, fn) =>
    Events.On("git:changed", (e: { data: { ws: string } }) => {
      if (e.data.ws === ws) fn();
    }),
  files: (ws) => ({
    list: async (dir) => (await WorkspaceService.List(ws, dir)) ?? [],
    readText: (path) => WorkspaceService.ReadText(ws, path),
    writeText: (path, content, mtime) => WorkspaceService.WriteText(ws, path, content, mtime),
    find: async (q, limit, ignored) => (await WorkspaceService.Find(ws, q, limit, ignored)) ?? [],
    create: (path, dir) => WorkspaceService.Create(ws, path, dir),
    rename: (from, to) => WorkspaceService.Rename(ws, from, to),
    trash: (path) => WorkspaceService.Trash(ws, path),
    reveal: (path) => WorkspaceService.Reveal(ws, path),
    gitBranch: () => WorkspaceService.GitBranch(ws),
    gitHead: (path) => WorkspaceService.GitHead(ws, path),
    gitStatus: async () => ((await WorkspaceService.GitStatus(ws)) ?? {}) as Record<string, string>,
    grep(query, opts, onHits) {
      const sock = Stream("search") as WebSocket;
      sock.binaryType = "arraybuffer";
      const dec = new TextDecoder();
      let error: string | null = null;
      const done = new Promise<string | null>((resolve) => {
        sock.onopen = () => sock.send(new TextEncoder().encode(JSON.stringify({ ws, query, ...opts })));
        sock.onmessage = (ev) => {
          const f = JSON.parse(typeof ev.data === "string" ? ev.data : dec.decode(ev.data as ArrayBuffer));
          if (f.error) error = f.error;
          if (f.hits) onHits(f.hits);
        };
        sock.onclose = () => resolve(error);
      });
      return { done, cancel: () => sock.close() };
    },
  }),
};
