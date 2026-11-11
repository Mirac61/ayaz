// Commands on files: save, open, create, rename, trash, paths, links and local history.
import { Text } from "@codemirror/state";
import { backend } from "../../core/backend";
import { isDirty } from "../../core/buffers";
import type { Command } from "../../core/commands";
import { browsable, resolveLink } from "../../editor/mdlive";
import { fileIcon, folderIcon } from "../../theme/icons";
import { bang, errText, inTree, type Ctx } from "./context";

// "5 min ago" for the history picker.
function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

const dirOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0));

export function fileCommands({ ws, files, ed, tree, say, fail, setPicker, prompt, closePane }: Ctx): Command[] {
  const save = async (force: boolean) => {
    const b = ed.current();
    if (!b) return fail("No file name"), false;
    try {
      await ed.format(); // no-op without a language server (Q25: on for Go)
      ed.cleanup();
      await ed.buffers.save(b, force);
      say(`"${b.path}" written`);
      ed.emit();
      return true;
    } catch (e) {
      fail(/changed on disk/.test(errText(e))
        ? `"${b.path}" changed on disk since it was read. :w! overwrites, :e! reloads`
        : errText(e));
      return false;
    }
  };

  // File commands act on the tree's row while the tree has focus, else on the active buffer.
  const target = () => {
    if (inTree()) return tree.current?.selected() ?? null;
    const b = ed.current();
    return b && !b.path.startsWith("/") ? { path: b.path, dir: false } : null; // not a library file outside the folder
  };
  const unsavedUnder = (path: string) =>
    ed.buffers.dirty().find((b) => b.path === path || b.path.startsWith(path + "/"));

  return [
    { id: "file.save", title: "Save file (:w)", run: (a) => save(bang(a).force) },
    { id: "file.saveClose", title: "Save and close pane (:wq)", run: async (a) => { if (await save(bang(a).force)) await closePane(bang(a).force); } },
    {
      id: "file.open",
      title: "Open file (:e)",
      async run(a) {
        const { force, rest } = bang(a);
        if (rest) return ed.open(rest.replace(/^\.\//, ""));
        const b = ed.current();
        if (!b) return;
        if (isDirty(b) && !force) return fail("No write since last change (add ! to override)");
        await ed.reload();
      },
    },
    {
      id: "file.new",
      title: "New file or folder",
      // arg "dir" (the + menu's "New folder"): the name is a folder without the trailing /.
      run(arg) {
        const t = target();
        const dir = t ? (t.dir ? t.path : dirOf(t.path)) : "";
        const at = dir ? `${dir}/` : "";
        prompt(`New ${arg === "dir" ? "folder" : "file"} in ${at || "./"}${arg === "dir" ? "" : " · end with / for a folder"}`, at, async (path) => {
          if (arg === "dir" && !path.endsWith("/")) path += "/";
          const isDir = path.endsWith("/");
          const p = path.replace(/\/+$/, "").replace(/^\.\//, "");
          await files.create(p, isDir);
          await tree.current?.reveal(p);
          if (!isDir) await ed.open(p);
          say(`Created "${p}${isDir ? "/" : ""}"`);
        });
      },
    },
    {
      id: "file.rename",
      title: "Rename or move file",
      run() {
        const t = target();
        if (!t) return fail("No file to rename");
        const d = unsavedUnder(t.path);
        if (d) return fail(`"${d.path}" has unsaved changes: save first (:w)`);
        prompt(`Rename "${t.path}" to`, t.path, async (to) => {
          if (to === t.path) return;
          await files.rename(t.path, to);
          await ed.moved(t.path, to);
          await tree.current?.reveal(to);
          say(`Renamed to "${to}"`);
        });
      },
    },
    {
      id: "file.trash",
      title: "Move file to trash",
      run() {
        const t = target();
        if (!t) return fail("No file to delete");
        const d = unsavedUnder(t.path);
        if (d) return fail(`"${d.path}" has unsaved changes: save first (:w)`);
        const back = inTree();
        setPicker({
          title: `Move "${t.path}${t.dir ? "/" : ""}" to the trash? · Enter confirms, Esc cancels`,
          query: async () => [{ label: "Move to trash", icon: t.dir ? folderIcon(false) : fileIcon(t.path) }],
          pick: () => void files.trash(t.path).then(async () => {
            await ed.moved(t.path, null);
            say(`"${t.path}" moved to the trash`);
            if (back) tree.current?.focus();
          }, (e) => fail(errText(e))),
        });
      },
    },
    {
      id: "file.copyPath",
      title: "Copy relative path",
      async run() {
        const t = target();
        if (!t) return fail("No file");
        await backend.copy(t.path);
        say(`Copied "${t.path}"`);
      },
    },
    {
      id: "file.copyPathLine",
      title: "Copy relative path:line of the cursor",
      async run() {
        const b = ed.current(), line = ed.cursorLine();
        if (!b || line === null) return fail("No file open");
        await backend.copy(`${b.path}:${line}`);
        say(`Copied "${b.path}:${line}"`);
      },
    },
    {
      id: "file.copyAbsPath",
      title: "Copy absolute path",
      async run() {
        const t = target();
        if (!t) return fail("No file");
        await backend.copy(`${ws.root}/${t.path}`);
        say(`Copied "${ws.root}/${t.path}"`);
      },
    },
    {
      id: "file.reveal",
      title: "Reveal in Finder",
      async run() {
        const t = target();
        if (!t) return fail("No file");
        await files.reveal(t.path);
      },
    },
    {
      id: "tree.revealCurrent",
      title: "Show current file in tree",
      async run() {
        const b = ed.current();
        if (!b || b.path.startsWith("/")) return fail("No file from this folder");
        await tree.current?.reveal(b.path);
        tree.current?.focus();
      },
    },
    {
      id: "link.browser",
      title: "Open link in browser (gx)",
      async run() {
        const t = ed.linkAtCursor();
        if (!t || !browsable(t)) return fail("No URL under the cursor");
        await backend.openURL(t);
      },
    },
    {
      id: "link.file",
      title: "Go to linked file (gf)",
      async run() {
        const b = ed.current(), t = ed.linkAtCursor();
        const p = b && t ? resolveLink(b.path, t) : null;
        if (!p) return fail("No relative file link under the cursor");
        await ed.open(p);
      },
    },
    {
      id: "file.history",
      title: "Local history: diff against an earlier save",
      async run() {
        const b = ed.current();
        if (!b) return fail("No file");
        const versions = await files.history(b.path);
        if (!versions.length) return fail(`No earlier saves of "${b.path}" yet`);
        const when = (t: number) => new Date(t).toLocaleString();
        setPicker({
          title: `History of ${b.path}`,
          query: async () => versions.map((v) => ({ label: when(v.time), hint: `${ago(v.time)} · ${v.size} B` })),
          pick: (_it, i) => void files.historyText(b.path, versions[i].time).then((text) => {
            if (ed.current() !== b) return;
            ed.diffWith(Text.of(text.split("\n")));
            say(`Diff against the save before ${when(versions[i].time)}, <Space>gd closes it`);
          }, (e) => fail(errText(e))),
        });
      },
    },
  ];
}
