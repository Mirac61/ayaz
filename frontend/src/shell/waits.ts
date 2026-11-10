// `ayaz --wait file` ends when the file is closed in the editor: callbacks per path, fired once no pane shows it.
export class Waits {
  private m = new Map<string, (() => void)[]>();

  add(path: string, fn: () => void) { this.m.set(path, [...(this.m.get(path) ?? []), fn]); }

  // Calls and forgets the callbacks of every path that isOpen no longer holds.
  check(isOpen: (path: string) => boolean) {
    for (const [path, fns] of [...this.m]) {
      if (isOpen(path)) continue;
      this.m.delete(path);
      fns.forEach((fn) => fn());
    }
  }
}
