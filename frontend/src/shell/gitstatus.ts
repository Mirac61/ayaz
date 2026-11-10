// What the tree shows for a path, from GitStatus: the path's own state, for a folder the strongest state below it,
// and for anything inside an ignored or untracked folder that folder's state.
const RANK: Record<string, number> = { U: 4, M: 3, A: 2, "?": 1 };

export function gitMarks(raw: Record<string, string>): (path: string) => string | undefined {
  const own = new Map(Object.entries(raw));
  const below = new Map<string, string>();
  for (const [p, c] of own) {
    if (!RANK[c]) continue; // ignored files don't color their folder
    for (let i = p.lastIndexOf("/"); i > 0; i = p.lastIndexOf("/", i - 1)) {
      const dir = p.slice(0, i);
      if ((RANK[below.get(dir) ?? ""] ?? 0) < RANK[c]) below.set(dir, c);
    }
  }
  return (path) => {
    const c = own.get(path) ?? below.get(path);
    if (c) return c;
    for (let i = path.lastIndexOf("/"); i > 0; i = path.lastIndexOf("/", i - 1)) {
      const up = own.get(path.slice(0, i));
      if (up === "!" || up === "?") return up;
    }
    return undefined;
  };
}

// One run at a time: calls while fn runs ask for one more run after it, so a burst of changes
// (a checkout, a build) costs two `git status` instead of one per watcher batch.
export function single(fn: () => Promise<void>): () => void {
  let running = false, again = false;
  const go = () => {
    if (running) return void (again = true);
    running = true;
    void fn().catch(() => {}).finally(() => {
      running = false;
      if (again) {
        again = false;
        go();
      }
    });
  };
  return go;
}
