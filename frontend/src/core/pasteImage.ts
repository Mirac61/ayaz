// Paste an image into Markdown: saved under assets/ next to the file, a link inserted (M67).
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

const pad = (n: number) => String(n).padStart(2, "0");

// Where a pasted image goes and how the Markdown file links to it; null for types a browser can't show.
export function imageTarget(mdPath: string, mime: string, now: Date): { path: string; link: string } | null {
  const ext = EXT[mime];
  if (!ext) return null;
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const link = `assets/image-${stamp}.${ext}`;
  const dir = mdPath.slice(0, mdPath.lastIndexOf("/") + 1);
  return { path: dir + link, link };
}
