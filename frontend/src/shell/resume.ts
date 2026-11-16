// The last search picker and what was typed in it, for <Space>f. (nvim's telescope/snacks "resume"). In memory only.
import type { PickerSource } from "./Picker";

let last: { source: PickerSource; q: string } | null = null;

// Only sources that opt in are kept: prompts, confirmations and the command palette must not come back.
export function remember(source: PickerSource, q: string) {
  if (source.resumable) {
    last = { source, q };
  }
}

// A new object, so the Picker mounts afresh instead of reusing the one that closed.
export const resumed = (): PickerSource | null => (last ? { ...last.source, initial: last.q } : null);

// The sources hold the old folder's files: a folder change drops them.
export const forget = () => void (last = null);
