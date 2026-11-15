// Back/forward across files, per pane, like a browser: opening another file pushes where the pane was;
// going back remembers where it came from for forward. Vim's <C-o>/<C-i> keep working inside one file.
export interface Spot { path: string; pos: number }

const MAX = 100;

export class Jumps {
  private back: Spot[] = [];
  private forward: Spot[] = [];

  // The pane leaves `from` for another file.
  push(from: Spot) {
    this.back.push(from);
    if (this.back.length > MAX) this.back.shift();
    this.forward = [];
  }

  // d = -1 back, 1 forward; `here` goes on the other stack. undefined at the end.
  go(d: -1 | 1, here: Spot): Spot | undefined {
    const [from, to] = d < 0 ? [this.back, this.forward] : [this.forward, this.back];
    const spot = from.pop();
    if (spot) to.push(here);
    return spot;
  }
}
