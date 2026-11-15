import type { TermHandle } from "../terminal/terminal";

export interface HiddenTerm { term: TermHandle; box: HTMLElement; title: string; cmd: string }

// Terminals without a pane: their shells run on, <Space>fb brings one back. Their boxes wait in the document, undrawn.
export class HiddenTerms {
  private list: HiddenTerm[] = [];
  private holder: HTMLElement | null = null;

  add(h: HiddenTerm) {
    if (!this.holder) {
      this.holder = document.createElement("div");
      this.holder.style.display = "none";
      document.body.append(this.holder);
    }
    this.holder.append(h.box);
    this.list.push(h);
  }

  has(title: string) { return this.list.some((h) => h.title === title); }

  // The terminal with this title, out of the list.
  take(title: string): HiddenTerm | undefined {
    const i = this.list.findIndex((h) => h.title === title);
    return i < 0 ? undefined : this.list.splice(i, 1)[0];
  }

  // A shell ended: if it was a hidden one, it leaves the list with its box. Returns its title, null if it wasn't hidden.
  end(t: TermHandle): string | null {
    const i = this.list.findIndex((h) => h.term === t);
    return i < 0 ? null : this.drop(i);
  }

  // Ends the hidden shell titled `title` (its tab was closed).
  kill(title: string) {
    const i = this.list.findIndex((h) => h.title === title);
    if (i >= 0) this.drop(i);
  }

  private drop(i: number): string {
    const [gone] = this.list.splice(i, 1);
    gone.term.dispose();
    gone.box.remove();
    return gone.title;
  }

  titles(): string[] { return this.list.map((h) => h.title); }

  setFont() { for (const h of this.list) h.term.setFont(); }

  disposeAll() {
    for (const h of this.list.splice(0)) h.term.dispose();
    this.holder?.remove();
    this.holder = null;
  }
}
