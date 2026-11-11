// Pickers that find things: files, buffers, text in files, and the quickfix list they fill.
import type { Command } from "../../core/commands";
import { backend, type Grep } from "../../core/backend";
import { isDirty } from "../../core/buffers";
import { fileTarget } from "../../core/fileTarget";
import { replacement, type Loc } from "../../core/quickfix";
import { fileIcon } from "../../theme/icons";
import type { Item, PickerSource } from "../Picker";
import { previewFile } from "../preview";
import { LIMIT, SHOWN, type Ctx } from "./context";
import type { QuickfixTools } from "./quickfix";

const FILE_KEYS = "Enter open · Cmd/Ctrl+Enter in a split · Ctrl+D / Ctrl+U scroll the preview";
const RECENT_SHOWN = 8; // recent files at the top of Find files before anything is typed

// A file row: the folder quiet and first to be cut, the name bright.
const fileItem = (path: string, positions: number[] | null | undefined, hint?: string): Item => ({
  label: path,
  positions: positions ?? [],
  icon: fileIcon(path),
  hint,
  dim: Array.from(path.slice(0, path.lastIndexOf("/") + 1)).length,
  dir: true,
});

export function findCommands(c: Ctx, q: QuickfixTools): Command[] {
  const { files, ed, qf, run, say, fail, setPicker } = c;
  let showIgnored = false;
  let grepRegex = false;
  // Cmd/Ctrl+Enter opens a file next to the current one; a terminal in the buffer list just comes back.
  const openIn = (it: Item, side?: boolean) => (side && !it.label.includes("://") ? "file.openSide" : "file.open");
  // Buffers can also be terminals ("term://…"): no file, no preview.
  const filePreview = (it: Item) => (it.label.includes("://") ? Promise.resolve(null) : previewFile(files, it.label));

  const filePicker = (title: string, list: () => string[], hint?: (p: string) => string | undefined): PickerSource => ({
    title,
    async query(query) {
      const all = list();
      const ms = query.trim() ? await backend.rank(all, query, LIMIT) : all.slice(0, LIMIT).map((path) => ({ path, positions: [] }));
      return ms.map((m) => fileItem(m.path, m.positions, hint?.(m.path)));
    },
    pick: (it, _i, side) => run(openIn(it, side), it.label),
    preview: filePreview,
    footer: FILE_KEYS,
    limit: LIMIT,
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
      preview: async (_, i) => (hits[i] ? previewFile(files, hits[i].path, hits[i].line) : null),
      placeholder: "Text to find",
      limit: SHOWN,
      footer: "Enter open · Ctrl+Q quickfix list · Ctrl+D / Ctrl+U scroll the preview",
      all: () => q.set(`Search "${text}"`, hits, regex),
      close: () => g?.cancel(),
    };
  };

  return [
    {
      id: "find.files",
      title: "Find files",
      run: () => {
        // "name:42" finds the name and opens it at line 42; typed, or pasted from a stack trace.
        let at: { line?: number; col?: number } = {};
        setPicker({
          title: showIgnored ? "Files (incl. ignored)" : "Files",
          async query(query) {
            const target = fileTarget(query);
            at = target;
            const ms = await files.find(target.text, LIMIT, showIgnored);
            const found = ms.map((m) => fileItem(m.path, m.positions, target.line ? `line ${target.line}` : undefined));
            if (query.trim()) return found;
            // Nothing typed yet: the files you were just in come first, so <Space>ff Enter is "back to where I was".
            const here = ed.current()?.path;
            const recent = ed.recent().filter((p) => p !== here).slice(0, RECENT_SHOWN);
            return [...recent.map((p) => fileItem(p, [], "recent")), ...found.filter((it) => !recent.includes(it.label))];
          },
          pick(it, _i, side) {
            if (at.line && !side) void ed.openAt(it.label, at.line, (at.col ?? 1) - 1);
            else run(openIn(it, side), it.label);
          },
          preview: (it) => (it.label.includes("://") ? Promise.resolve(null) : previewFile(files, it.label, at.line)),
          footer: FILE_KEYS,
          limit: LIMIT,
          placeholder: "File name, or name:line",
        });
      },
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
