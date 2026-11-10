// The indentation a file already uses, so other people's files keep their style. null: too little to tell.
export const INDENT_SAMPLE = 20000; // chars looked at

export function detectIndent(text: string): { tabs: true } | { tabs: false; width: number } | null {
  let tabLines = 0, spaceLines = 0, prev = 0;
  const steps = new Map<number, number>(); // indent growth between neighboring lines → how often
  for (const line of text.split("\n", 400)) {
    if (!line.trim()) continue;
    if (line[0] === "\t") { tabLines++; continue; }
    const n = line.length - line.trimStart().length;
    if (n > 0) spaceLines++;
    const d = n - prev;
    if (d > 0 && d <= 8) steps.set(d, (steps.get(d) ?? 0) + 1);
    prev = n;
  }
  if (tabLines >= 3 && tabLines > spaceLines) return { tabs: true };
  const [width, count] = [...steps].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [0, 0];
  return count >= 3 && spaceLines > tabLines ? { tabs: false, width } : null;
}
