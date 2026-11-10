// The quickfix list as the shell uses it: jump, pick, fill from a search or the LSP, replace across files.
import { Text } from "@codemirror/state";
import { isDirty } from "../../core/buffers";
import { label, replaceEdits, type Loc } from "../../core/quickfix";
import { fileIcon } from "../../theme/icons";
import type { Item, PickerSource } from "../Picker";
import type { Ctx } from "./context";

export function quickfixTools({ ed, files, qf, say, fail }: Ctx) {
  const locItem = (l: Loc): Item => ({ label: label(l), icon: fileIcon(l.path) });

  const jump = async (l: Loc) => {
    await ed.openAt(l.path, l.line, l.col);
    if (qf.items.includes(l)) say(`(${qf.index + 1} of ${qf.items.length}) ${l.text.trim()}`);
  };

  const move = (d: number) => {
    if (!qf.items.length) return fail("No quickfix list");
    const l = qf.move(d);
    return l ? jump(l) : fail("No more items");
  };

  const picker = (): PickerSource => ({
    title: `Quickfix: ${qf.title}`,
    query: async (q) => qf.items.filter((l) => !q || label(l).toLowerCase().includes(q.toLowerCase())).map(locItem),
    pick: (it) => {
      const i = qf.items.findIndex((l) => label(l) === it.label);
      if (i >= 0) void jump(qf.select(i));
    },
    start: Math.max(qf.index, 0),
  });

  const set = (title: string, locs: Loc[], regex = false, sort = true) => {
    qf.set(title, locs, regex, sort);
    if (!locs.length) return fail(`${title}: no matches`);
    say(`${title}: ${locs.length} matches, :cn / :cp to move, :copen to list`);
    void move(1);
  };

  // Fills in each location's line text from the open buffer or the file.
  const withText = async (locs: Loc[]) => {
    const docs = new Map<string, Text | null>();
    for (const l of locs) {
      if (!docs.has(l.path)) {
        const b = ed.buffers.get(l.path);
        docs.set(l.path, b ? b.state.doc : await files.readText(l.path).then((f) => Text.of(f.content.split("\n")), () => null));
      }
      const d = docs.get(l.path);
      if (d && l.line <= d.lines) l.text = d.line(l.line).text;
    }
    return locs;
  };

  // Replaces every quickfix match with `to`; buffers that were clean are saved, dirty ones stay open unsaved.
  const replaceAll = async (to: string) => {
    const byPath = new Map<string, Loc[]>();
    for (const l of qf.items) byPath.set(l.path, [...(byPath.get(l.path) ?? []), l]);
    let n = 0, skipped = 0;
    const unsaved: string[] = [];
    for (const [path, locs] of byPath) {
      const before = await ed.buffers.open(path);
      if (before.state.readOnly) { skipped += locs.length; continue; }
      const wasDirty = isDirty(before);
      const r = replaceEdits(locs, before.state.doc, to, qf.regex);
      skipped += r.skipped;
      if (!r.changes.length) continue;
      const b = await ed.edit(path, r.changes);
      n += r.changes.length;
      if (wasDirty) unsaved.push(path);
      else await ed.buffers.save(b);
    }
    ed.emit();
    say(`Replaced ${n} in ${byPath.size} files` + (skipped ? `, ${skipped} skipped (changed since the search)` : "") + (unsaved.length ? `; not saved (had changes): ${unsaved.join(", ")}` : ""));
  };

  return { locItem, jump, move, picker, set, withText, replaceAll };
}

export type QuickfixTools = ReturnType<typeof quickfixTools>;
