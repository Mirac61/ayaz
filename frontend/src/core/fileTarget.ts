// "src/app.go:42" or "src/app.go:42:7": a file name with a position, as compilers and stack traces print them.
// text is what is left for the file search; line and column are 1-based.
export function fileTarget(q: string): { text: string; line?: number; col?: number } {
  const m = /^(.*?):(\d+)(?::(\d+))?$/.exec(q.trim());
  if (!m || !m[1]) return { text: q };
  return { text: m[1], line: Number(m[2]), ...(m[3] && { col: Number(m[3]) }) };
}
