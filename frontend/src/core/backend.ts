// The only place that imports generated bindings or the Wails runtime (02-architecture, principle 2).
import { Application, Browser, Call, Clipboard, Events, Stream, Window } from "@wailsio/runtime";
import { ConfigService, PingService, UpdateService, WorkspaceService } from "../../bindings/github.com/Mirac61/ayaz/app";
import type { HeadFile, Info, Match, OpenEvent, Swap, UpdateInfo, Version } from "../../bindings/github.com/Mirac61/ayaz/app";
import type { Blame, FileStatus } from "../../bindings/github.com/Mirac61/ayaz/internal/git";
import type { Entry, Preview, TextFile } from "../../bindings/github.com/Mirac61/ayaz/internal/workspace";
import type { Match as FileMatch } from "../../bindings/github.com/Mirac61/ayaz/internal/index";
import type { Loc } from "./quickfix";

export type { Blame, Entry, FileMatch, FileStatus, HeadFile, Info, Match, OpenEvent, Preview, Swap, TextFile, UpdateInfo, Version };

// A batch of changes on disk. Paths are workspace-relative, files or folders; rescan: events were lost, check everything.
// A file in the config folder the app watches.
export type ConfigFile = "settings.json" | "keymap.json" | "snippets.json";

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
  clone(repoURL: string): Promise<Info | null>;
  closeWorkspace(ws: string): Promise<void>; // watcher, index, shells, servers (ADR-0014)
  closeWindow(): Promise<void>; // this window; a no-op in the server build
  newWindow(): Promise<void>;
  // The user asked to close this window; the frontend decides (unsaved buffers) and calls closeWindow.
  onCloseRequest(ws: string, fn: () => void): () => void;
  // `ayaz file:line` from a terminal: the file this window was started for (once), and files sent to a running window.
  // The shown file's close answers a waiting call (`--wait`) through waitDone(event.wait).
  takeOpen(): Promise<OpenEvent | null>;
  onOpen(ws: string, fn: (e: OpenEvent) => void): () => void;
  waitDone(id: number): Promise<void>;
  files(ws: string): Files;
  keymap(): Promise<string>; // the user's keymap.json, "" if none
  settings(): Promise<string>; // the user's settings.json, "" if none
  snippets(): Promise<string>; // the user's snippets.json, "" if none
  configFolder(): Promise<string>; // where settings.json and keymap.json live; creates an empty settings.json
  docsFolder(files: Record<string, string>): Promise<string>; // writes the docs (name → Markdown) to <config>/docs
  openSettings(): Promise<void>; // a new window on the config folder, settings.json open
  // Fuzzy-ranks a short list (recent files, buffers, commands) with the Go matcher.
  rank(items: string[], query: string, limit: number): Promise<FileMatch[]>;
  // Calls fn for changes on disk in workspace ws, also our own saves. Returns the unsubscribe function.
  onFsChanged(ws: string, fn: (c: FsChange) => void): () => void;
  onLspStatus(ws: string, fn: (s: LspStatus) => void): () => void;
  // HEAD, the index or the reflog of ws's repository moved (commit, checkout, stage); Go polls every second.
  onGitChanged(ws: string, fn: () => void): () => void;
  onConfigChanged(fn: (file: ConfigFile) => void): () => void; // saved in the config folder
  openURL(url: string): Promise<void>; // in the system browser
  copy(text: string): Promise<void>; // to the system clipboard
  zoom(level: number): Promise<void>; // this window's page zoom, 1 = 100 %; fails in the server build
  platform(): Promise<string>; // OS and Linux distro, e.g. "darwin", "windows", "linux-arch", "linux-debian"
  checkUpdate(): Promise<UpdateInfo | null>;
  downloadAndInstallUpdate(): Promise<void>;
  restartApp(): Promise<void>;
  currentVersion(): Promise<string>;
  onUpdateAvailable(fn: (info: UpdateInfo) => void): () => void;
  onUpdateProgress(fn: (progress: { written: number; total: number; percent: number }) => void): () => void;
  onUpdateReady(fn: () => void): () => void;
  onUpdateError(fn: (err: string) => void): () => void;
}

// A running project search; cancel() stops it (closes the stream). done resolves with an error text, or null.
export interface Grep { done: Promise<string | null>; cancel(): void }

// File access bound to one workspace; paths are workspace-relative with "/".
export interface Files {
  list(dir: string): Promise<Entry[]>;
  readText(path: string): Promise<TextFile>;
  preview(path: string, maxBytes: number): Promise<Preview>; // the start of a text file; rejects for binary ones
  // Resolves to the new mtime. Rejects with "file changed on disk" if the file moved past expectedMtime.
  writeText(path: string, content: string, expectedMtime: number): Promise<number>;
  // Fuzzy file search, best first; positions index into the path's code points. ignored: include Git-ignored files.
  find(query: string, limit: number, ignored: boolean): Promise<FileMatch[]>;
  // Project search over the same files as find (ADR-0016); hits arrive in batches.
  grep(query: string, opts: { regex: boolean; ignored: boolean }, onHits: (hits: Loc[]) => void): Grep;
  create(path: string, dir: boolean): Promise<void>; // missing parent folders too; rejects if path exists
  writeNew(path: string, base64: string): Promise<void>; // a new binary file (pasted image); rejects if path exists
  rename(from: string, to: string): Promise<void>; // rejects if `to` exists
  trash(path: string): Promise<void>; // to the system trash
  reveal(path: string): Promise<void>; // in Finder / the file manager
  gitBranch(): Promise<string>; // "" outside a repository, a short SHA when detached
  gitHead(path: string): Promise<HeadFile>; // the file at HEAD; tracked=false for new files
  gitIndex(path: string): Promise<HeadFile>; // the file as staged; tracked=false when it isn't in the index
  // Stages one hunk ("@@ -a,b +c,d @@" with its lines, no context) of the file, or with reverse takes it out of the index.
  gitApplyHunk(path: string, hunk: string, reverse: boolean): Promise<void>;
  // Who last changed line (1-based): text is the buffer's when it has unsaved changes, else "". null: nothing to show.
  gitBlame(path: string, line: number, text: string): Promise<Blame | null>;
  gitStatus(): Promise<Record<string, string>>; // changed, untracked and ignored paths: M A ? ! U (empty outside a repo)
  gitDetailedStatus(): Promise<FileStatus[]>; // all changed/staged/untracked files
  gitStageFile(path: string): Promise<void>;
  gitUnstageFile(path: string): Promise<void>;
  gitDiscardFile(path: string): Promise<void>;
  gitStageAll(): Promise<void>;
  gitUnstageAll(): Promise<void>;
  gitCommit(msg: string): Promise<void>;
  gitPush(): Promise<void>;
  gitPull(): Promise<void>;
  gitFetch(): Promise<void>;
  gitRebase(): Promise<void>;
  // Hot exit: unsaved text kept in the user cache, outside the project.
  swapWrite(path: string, text: string): Promise<void>;
  swapRemove(path: string): Promise<void>;
  swaps(): Promise<Swap[]>; // what a previous run of this folder left unsaved
  history(path: string): Promise<Version[]>; // texts earlier saves replaced, newest first
  historyText(path: string, time: number): Promise<string>;
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
  clone: (repoURL) => Call.ByName("github.com/Mirac61/ayaz/app.WorkspaceService.Clone", repoURL),
  closeWorkspace: (ws) => WorkspaceService.Close(ws),
  closeWindow: () => WorkspaceService.CloseWindow(),
  newWindow: () => WorkspaceService.NewWindow(),
  takeOpen: () => WorkspaceService.TakeOpen(),
  onOpen: (ws, fn) =>
    Events.On("app:open", (e: { data: OpenEvent }) => {
      if (e.data.ws === ws) fn(e.data);
    }),
  waitDone: (id) => WorkspaceService.WaitDone(id),
  onCloseRequest: (ws, fn) =>
    Events.On("app:close-request", (e: { data: string }) => {
      if (e.data === ws) fn();
    }),
  keymap: () => ConfigService.Keymap(),
  settings: () => ConfigService.Settings(),
  snippets: () => ConfigService.Snippets(),
  configFolder: () => ConfigService.Folder(),
  docsFolder: (files) => ConfigService.DocsFolder(files),
  openSettings: () => ConfigService.OpenSettings(),
  rank: async (items, q, limit) => (await WorkspaceService.Rank(items, q, limit)) ?? [],
  openURL: (url) => Browser.OpenURL(url),
  copy: (text) => Clipboard.SetText(text),
  zoom: (level) => Window.SetZoom(level),
  platform: () => WorkspaceService.Platform(),
  checkUpdate: async () => (await UpdateService.Check()) ?? null,
  downloadAndInstallUpdate: () => UpdateService.DownloadAndInstall(),
  restartApp: () => UpdateService.Restart(),
  currentVersion: () => UpdateService.CurrentVersion(),
  onUpdateAvailable: (fn) => Events.On("ayaz:updater:available", (e: { data: UpdateInfo }) => fn(e.data)),
  onUpdateProgress: (fn) => Events.On("wails:updater:download-progress", (e: { data?: { bytesWritten?: number; bytesTotal?: number; Written?: number; Total?: number } }) => {
    const d = e?.data || {};
    const written = d.bytesWritten ?? d.Written ?? 0;
    const total = d.bytesTotal ?? d.Total ?? 0;
    const percent = total > 0 ? Math.round((written / total) * 100) : 0;
    fn({ written, total, percent });
  }),
  onUpdateReady: (fn) => Events.On("wails:updater:update-ready", () => fn()),
  onUpdateError: (fn) => Events.On("wails:updater:error", (e: { data?: { message?: string; Error?: string } | string }) => {
    const msg = typeof e?.data === "string" ? e.data : (e?.data?.message || e?.data?.Error || "Update error");
    fn(msg);
  }),
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
  onConfigChanged: (fn) => Events.On("config:changed", (e: { data: { file: ConfigFile } }) => fn(e.data.file)),
  files: (ws) => ({
    list: async (dir) => (await WorkspaceService.List(ws, dir)) ?? [],
    readText: (path) => WorkspaceService.ReadText(ws, path),
    preview: (path, max) => WorkspaceService.Preview(ws, path, max),
    writeText: (path, content, mtime) => WorkspaceService.WriteText(ws, path, content, mtime),
    find: async (q, limit, ignored) => (await WorkspaceService.Find(ws, q, limit, ignored)) ?? [],
    create: (path, dir) => WorkspaceService.Create(ws, path, dir),
    writeNew: (path, data) => WorkspaceService.WriteNew(ws, path, data),
    rename: (from, to) => WorkspaceService.Rename(ws, from, to),
    trash: (path) => WorkspaceService.Trash(ws, path),
    reveal: (path) => WorkspaceService.Reveal(ws, path),
    gitBranch: () => WorkspaceService.GitBranch(ws),
    gitHead: (path) => WorkspaceService.GitHead(ws, path),
    gitIndex: (path) => WorkspaceService.GitIndex(ws, path),
    gitApplyHunk: (path, hunk, reverse) => WorkspaceService.GitApplyHunk(ws, path, hunk, reverse),
    gitBlame: (path, line, text) => WorkspaceService.GitBlame(ws, path, text, line),
    gitStatus: async () => ((await WorkspaceService.GitStatus(ws)) ?? {}) as Record<string, string>,
    gitDetailedStatus: async () => ((await WorkspaceService.GitDetailedStatus(ws)) ?? []) as FileStatus[],
    gitStageFile: (path) => WorkspaceService.GitStageFile(ws, path),
    gitUnstageFile: (path) => WorkspaceService.GitUnstageFile(ws, path),
    gitDiscardFile: (path) => WorkspaceService.GitDiscardFile(ws, path),
    gitStageAll: () => WorkspaceService.GitStageAll(ws),
    gitUnstageAll: () => WorkspaceService.GitUnstageAll(ws),
    gitCommit: (msg) => WorkspaceService.GitCommit(ws, msg),
    gitPush: () => Call.ByName("github.com/Mirac61/ayaz/app.WorkspaceService.GitPush", ws),
    gitPull: () => Call.ByName("github.com/Mirac61/ayaz/app.WorkspaceService.GitPull", ws),
    gitFetch: () => Call.ByName("github.com/Mirac61/ayaz/app.WorkspaceService.GitFetch", ws),
    gitRebase: () => Call.ByName("github.com/Mirac61/ayaz/app.WorkspaceService.GitRebase", ws),
    swapWrite: (path, text) => WorkspaceService.SwapWrite(ws, path, text),
    swapRemove: (path) => WorkspaceService.SwapRemove(ws, path),
    swaps: async () => (await WorkspaceService.Swaps(ws)) ?? [],
    history: async (path) => (await WorkspaceService.History(ws, path)) ?? [],
    historyText: (path, time) => WorkspaceService.HistoryText(ws, path, time),
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
