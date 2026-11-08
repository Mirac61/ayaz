// The only place that imports generated bindings or the Wails runtime (02-architecture, principle 2).
import { Application, Browser, Events, Stream } from "@wailsio/runtime";
import { ConfigService, PingService, WorkspaceService } from "../../bindings/github.com/Mirac61/ayaz/app";
import type { Info, Match } from "../../bindings/github.com/Mirac61/ayaz/app";
import type { Entry, TextFile } from "../../bindings/github.com/Mirac61/ayaz/internal/workspace";
import type { Match as FileMatch } from "../../bindings/github.com/Mirac61/ayaz/internal/index";

export type { Entry, FileMatch, Info, Match, TextFile };

// A batch of changes on disk. Paths are workspace-relative, files or folders; rescan: events were lost, check everything.
export interface FsChange { paths: string[] | null; rescan: boolean }

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
  files(ws: string): Files;
  keymap(): Promise<string>; // the user's keymap.json, "" if none
  // Fuzzy-ranks a short list (recent files, buffers, commands) with the Go matcher.
  rank(items: string[], query: string, limit: number): Promise<FileMatch[]>;
  // Calls fn for changes on disk in workspace ws, also our own saves. Returns the unsubscribe function.
  onFsChanged(ws: string, fn: (c: FsChange) => void): () => void;
  openURL(url: string): Promise<void>; // in the system browser
}

// File access bound to one workspace; paths are workspace-relative with "/".
export interface Files {
  list(dir: string): Promise<Entry[]>;
  readText(path: string): Promise<TextFile>;
  // Resolves to the new mtime. Rejects with "file changed on disk" if the file moved past expectedMtime.
  writeText(path: string, content: string, expectedMtime: number): Promise<number>;
  // Fuzzy file search, best first; positions index into the path's code points. ignored: include Git-ignored files.
  find(query: string, limit: number, ignored: boolean): Promise<FileMatch[]>;
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
  keymap: () => ConfigService.Keymap(),
  rank: async (items, q, limit) => (await WorkspaceService.Rank(items, q, limit)) ?? [],
  openURL: (url) => Browser.OpenURL(url),
  onFsChanged: (ws, fn) =>
    Events.On("fs:changed", (e: { data: FsChange & { ws: string } }) => {
      if (e.data.ws === ws) fn(e.data);
    }),
  files: (ws) => ({
    list: async (dir) => (await WorkspaceService.List(ws, dir)) ?? [],
    readText: (path) => WorkspaceService.ReadText(ws, path),
    writeText: (path, content, mtime) => WorkspaceService.WriteText(ws, path, content, mtime),
    find: async (q, limit, ignored) => (await WorkspaceService.Find(ws, q, limit, ignored)) ?? [],
  }),
};
