// Pane content other than the editor and terminal (ADR-0011): a provider mounts into a pane's element.
// shortcut: the editor and terminal aren't providers yet, Editors handles them directly; move them here if a third kind of text view comes.
import { extOf } from "../lang/registry";

export interface ViewHandle {
  focus(): void;
  dispose(): void;
  status(): string; // shown in the status line, e.g. "125% 640×480"
  reload?(): void; // the file changed on disk
}

export interface ViewContext {
  url: string; // the file under /fs/
  onStatus(): void; // status() changed
  openURL?(url: string): void; // links inside the file, in the system browser
}

export interface ViewProvider {
  id: string;
  exts: string[];
  scheme?: string; // tab paths starting with it, "browser://" for the browser; the url is what follows
  mount(el: HTMLElement, ctx: ViewContext): ViewHandle;
}

const providers: ViewProvider[] = [];
export const registerViewer = (p: ViewProvider) => void providers.push(p);
export const BROWSER = "browser://"; // a browser tab's path: browser://localhost:3000
export const viewerFor = (path: string) =>
  providers.find((p) => (p.scheme ? path.startsWith(p.scheme) : p.exts.includes(extOf(path))));

// /fs/<ws>/<path>, each segment encoded.
export const fsUrl = (ws: string, path: string) => `/fs/${encodeURIComponent(ws)}/${path.split("/").map(encodeURIComponent).join("/")}`;
