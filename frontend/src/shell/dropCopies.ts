// Big Finder drops being copied, one entry per drop (Go numbers them): several at once share one status line.
export type DropCopies = Record<number, { name: string; done: number; total: number }>;

export function copyProgress(s: DropCopies, p: { id: number; name: string; done: number; total: number }): DropCopies {
  return { ...s, [p.id]: { name: p.name, done: p.done, total: p.total } };
}

export function copyDone(s: DropCopies, id: number): DropCopies {
  const { [id]: _gone, ...rest } = s;
  return rest;
}

// The status line text: the one drop's current item, or the number of drops, which may go to different folders. The
// percentage is over all bytes together.
export function copyLabel(s: DropCopies): { title: string; percent: number } | null {
  const all = Object.values(s);
  if (!all.length) {
    return null;
  }
  const done = all.reduce((n, c) => n + c.done, 0);
  const total = all.reduce((n, c) => n + c.total, 0);
  const percent = Math.min(100, Math.floor((done * 100) / total));
  const title =
    all.length === 1 ? `Copying "${all[0].name}" into the folder: ${percent}%` : `Copying ${all.length} drops: ${percent}%`;
  return { title, percent };
}
