// What the tree shows for a path, from GitStatus: the path's own state, for a folder the strongest state below it,
// and for anything inside an ignored or untracked folder that folder's state.
const RANK: Record<string, number> = { U: 4, M: 3, A: 2, "?": 1 };

export function gitMarks(raw: Record<string, string>): (path: string) => string | undefined {
  const own = new Map(Object.entries(raw));
  const below = new Map<string, string>();
  for (const [p, c] of own) {
    if (!RANK[c]) {
      continue;
    } // ignored files don't color their folder
    for (let i = p.lastIndexOf("/"); i > 0; i = p.lastIndexOf("/", i - 1)) {
      const dir = p.slice(0, i);
      if ((RANK[below.get(dir) ?? ""] ?? 0) < RANK[c]) {
        below.set(dir, c);
      }
    }
  }
  return (path) => {
    const c = own.get(path) ?? below.get(path);
    if (c) {
      return c;
    }
    for (let i = path.lastIndexOf("/"); i > 0; i = path.lastIndexOf("/", i - 1)) {
      const up = own.get(path.slice(0, i));
      if (up === "!" || up === "?") {
        return up;
      }
    }
    return undefined;
  };
}

// One run at a time: calls while fn runs ask for one more run after it, so a burst of changes
// (a checkout, a build) costs two `git status` instead of one per watcher batch. `gap` (ms) is the least time between
// the end of a run and the start of the next, so a long burst runs at most every gap + one run.
export function single(fn: () => Promise<void>, gap = 0): () => void {
  let running = false,
    waiting = false,
    again = false,
    last = 0;
  const start = () => {
    running = true;
    void fn()
      .catch(() => {})
      .finally(() => {
        running = false;
        last = Date.now();
        if (again) {
          again = false;
          go();
        }
      });
  };
  const go = () => {
    if (waiting) {
      return; // the run that is already waiting covers this call
    }
    if (running) {
      return void (again = true);
    }
    const wait = last + gap - Date.now();
    if (wait > 0) {
      waiting = true;
      setTimeout(() => {
        waiting = false;
        start();
      }, wait);
      return;
    }
    start();
  };
  return go;
}
