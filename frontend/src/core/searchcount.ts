import type { Text } from "@codemirror/state";

const MAX_MATCHES = 1000;
const MAX_DOC = 200_000; // characters; a bigger file would make every cursor move scan too much

// Where each match of the query starts. The status line asks on every cursor move, so one (document, query) pair is kept.
let cache: { doc: Text; query: string; starts: number[]; more: boolean } | null = null;

function matchStarts(doc: Text, query: RegExp) {
  const key = `${query.flags}/${query.source}`;
  if (cache?.doc === doc && cache.query === key) return cache;
  const re = new RegExp(query.source, query.flags.replace("g", "") + "g");
  const starts: number[] = [];
  let more = false;
  for (const m of doc.toString().matchAll(re)) {
    if (starts.length === MAX_MATCHES) { more = true; break; }
    starts.push(m.index);
  }
  return (cache = { doc, query: key, starts, more });
}

// "3/12": the match at or before the cursor out of all of them, like nvim's search count; "12/1000+" when there are more.
// null for a document too big to scan on every cursor move.
export function searchCount(doc: Text, query: RegExp, head: number): string | null {
  if (doc.length > MAX_DOC) return null;
  const { starts, more } = matchStarts(doc, query);
  let lo = 0, hi = starts.length; // how many matches start at or before head
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= head) lo = mid + 1;
    else hi = mid;
  }
  return `${Math.min(Math.max(lo, 1), starts.length)}/${starts.length}${more ? "+" : ""}`;
}
