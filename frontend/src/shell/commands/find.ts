// Pickers that find things: files, buffers, text in files, and the quickfix list they fill.
import type { Command } from "../../core/commands";
import { backend, type Grep } from "../../core/backend";
import { isDirty } from "../../core/buffers";
import { replacement, type Loc } from "../../core/quickfix";
import { fileIcon } from "../../theme/icons";
import type { PickerSource } from "../Picker";
import { LIMIT, SHOWN, type Ctx } from "./context";
import type { QuickfixTools } from "./quickfix";

export function findCommands(c: Ctx, q: QuickfixTools): Command[] {
  const { files, ed, qf, run, say, fail, setPicker } = c;
  let showIgnored = false;
  let grepRegex = false;

  const filePicker = (title: string, list: () => string[], hint?: (p: string) => string | undefined): PickerSource => ({
    title,
    async query(query) {
      const all = list();
      const ms = query.trim() ? await backend.rank(all, query, LIMIT) : all.slice(0, LIMIT).map((path) => ({ path, positions: [] }));
      return ms.map((m) => ({ label: m.path, positions: m.positions ?? [], icon: fileIcon(m.path), hint: hint?.(m.path) }));
    },
    pick: (it) => run("file.open", it.label),
  });

  const grepPicker = (): PickerSource => {
    let g: Grep | null = null, hits: Loc[] = [], text = "";
    const regex = grepRegex; // the quickfix list remembers it for :Replace's $1, $2
    return {
      title: `Search in files${regex ? " (regex)" : ""} · <C-q> to quickfix`,
      query(query, update) {
        g?.cancel();
        hits = [];
        text = query;
        if (!query.trim()) return Promise.resolve([]);
        const cur = (g = files.grep(query, { regex, ignored: showIgnored }, (h) => {
          hits.push(...h);
          update(hits.slice(0, SHOWN).map(q.locItem));
        }));
        cur.done.then((err) => err && cur === g && fail(err));
        return Promise.resolve([]);
      },
      pick: (_, i) => void (hits[i] && q.jump(hits[i])),
      all: () => q.set(`Search "${text}"`, hits, regex),
      close: () => g?.cancel(),
    };
  };

  return [
    {
      id: "find.files",
      title: "Find files",
      run: () => setPicker({
        title: showIgnored ? "Files (incl. ignored)" : "Files",
        async query(query) {
          const ms = await files.find(query, LIMIT, showIgnored);
          return ms.map((m) => ({ label: m.path, positions: m.positions ?? [], icon: fileIcon(m.path) }));
        },
        pick: (it) => run("file.open", it.label),
      }),
    },
    {
      id: "find.toggleIgnored",
      title: "Toggle ignored files in Find files",
      run: () => say((showIgnored = !showIgnored) ? "Find files: showing ignored files" : "Find files: hiding ignored files"),
    },
    { id: "find.grep", title: "Search in files", run: () => setPicker(grepPicker()) },
    {
      id: "find.toggleRegex",
      title: "Toggle regex in Search in files",
      run: () => say((grepRegex = !grepRegex) ? "Search in files: regex (Go RE2)" : "Search in files: literal"),
    },
    { id: "find.recent", title: "Recent files", run: () => setPicker(filePicker("Recent files", () => ed.recent())) },
    {
      id: "find.buffers",
      title: "Buffers",
      run: () => setPicker(filePicker("Buffers", () => [...ed.bufferList().map((b) => b.path), ...ed.hiddenTerms()],
        (p) => (ed.buffers.get(p) && isDirty(ed.buffers.get(p)!) ? "[+]" : undefined))),
    },
    { id: "qf.next", title: "Next quickfix entry (:cn)", run: () => q.move(1) },
    { id: "qf.prev", title: "Previous quickfix entry (:cp)", run: () => q.move(-1) },
    { id: "qf.open", title: "Quickfix list (:copen)", run: () => (qf.items.length ? setPicker(q.picker()) : fail("No quickfix list")) },
    {
      id: "qf.replace",
      title: "Replace quickfix matches (:Replace text)",
      run(a) {
        if (!qf.items.length) return fail("No quickfix list; search first (<Space>fw, then <C-q>)");
        const to = a ?? "";
        const paths = new Set(qf.items.map((l) => l.path)).size;
        setPicker({
          title: `Replace ${qf.items.length} matches in ${paths} files with "${to}" · Enter applies all, Esc cancels`,
          query: async () => qf.items.map((l) => ({
            label: `${l.path}:${l.line}: ${(l.text.slice(0, l.col) + replacement(l, to, qf.regex) + l.text.slice(l.col + l.len)).trim()}`,
            icon: fileIcon(l.path),
          })),
          pick: () => run("qf.replaceNow", to),
        });
      },
    },
    { id: "qf.replaceNow", title: "Replace quickfix matches without preview", run: (a) => q.replaceAll(a ?? "") },
  ];
}
