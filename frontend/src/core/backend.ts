// The only place that imports generated bindings or the Wails runtime (02-architecture, principle 2).
import { Application, Events, Stream } from "@wailsio/runtime";
import { PingService, WorkspaceService } from "../../bindings/github.com/Mirac61/ayaz/app";
import type { Info, Match } from "../../bindings/github.com/Mirac61/ayaz/app";
import type { Entry, TextFile } from "../../bindings/github.com/Mirac61/ayaz/internal/workspace";

export type { Entry, Info, Match, TextFile };

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
}

// File access bound to one workspace; paths are workspace-relative with "/".
export interface Files {
  list(dir: string): Promise<Entry[]>;
  readText(path: string): Promise<TextFile>;
  // Resolves to the new mtime. Rejects with "file changed on disk" if the file moved past expectedMtime.
  writeText(path: string, content: string, expectedMtime: number): Promise<number>;
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
  files: (ws) => ({
    list: async (dir) => (await WorkspaceService.List(ws, dir)) ?? [],
    readText: (path) => WorkspaceService.ReadText(ws, path),
    writeText: (path, content, mtime) => WorkspaceService.WriteText(ws, path, content, mtime),
  }),
};
