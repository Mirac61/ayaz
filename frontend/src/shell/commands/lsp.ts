// Language-server commands: references, hover, rename, code actions, symbols and diagnostics.
import { nextDiagnostic, previousDiagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { backend } from "../../core/backend";
import type { Command } from "../../core/commands";
import type { Loc } from "../../core/quickfix";
import { diagnosticsFor } from "../../editor/diagnostics";
import {
  codeActions, documentSymbols, hasLsp, noServer, references, renameAt, resolveAction, runCommand, showHover, uriPath,
  workspaceSymbols, type CodeAction, type Sym,
} from "../../editor/lsp";
import { symbolIcon } from "../../theme/icons";
import type { Item, PickerSource } from "../Picker";
import { errText, LIMIT, onView, SHOWN, type Ctx } from "./context";
import type { QuickfixTools } from "./quickfix";

// @codemirror/lint selects the whole range, which puts Vim in visual mode; nvim's ]d lands on its start.
const toDiagnostic = (cmd: (v: EditorView) => boolean) => (v: EditorView) => {
  if (!cmd(v)) return false;
  v.dispatch({ selection: { anchor: v.state.selection.main.from } });
  return true;
};

export function lspCommands(c: Ctx, q: QuickfixTools): Command[] {
  const { ws, ed, say, fail, setPicker, prompt } = c;

  // Symbols in a picker. rank: fuzzy-rank by name here (a file's symbols); else the server already matched (project).
  // Items map to their symbol, so two symbols with one name (two `init`) both stay pickable.
  const symbolPicker = (title: string, load: (q: string) => Promise<Sym[]>, rank: boolean): PickerSource => {
    const sym = new WeakMap<Item, Sym>();
    const item = (s: Sym, positions: number[] = []): Item => {
      const it = { label: s.name, positions, icon: symbolIcon(s.kind), hint: rank ? s.container : `${s.path}:${s.line}` };
      sym.set(it, s);
      return it;
    };
    return {
      title,
      async query(query) {
        const all = await load(query);
        if (!rank || !query.trim()) return all.slice(0, SHOWN).map((s) => item(s));
        const byName = new Map<string, Sym[]>();
        for (const s of all) byName.set(s.name, [...(byName.get(s.name) ?? []), s]);
        const ms = await backend.rank([...byName.keys()], query, LIMIT);
        return ms.flatMap((m) => byName.get(m.path)!.map((s) => item(s, m.positions ?? [])));
      },
      pick: (it) => {
        const s = sym.get(it);
        if (s) void ed.openAt(s.path, s.line, s.col);
      },
    };
  };

  return [
    {
      id: "lsp.references",
      title: "References (gr)",
      async run() {
        const v = ed.activeView();
        const locs = v && (await references(v, ws.root));
        if (!locs) return fail(noServer(ws.id, ed.current()?.path));
        q.set("References", await q.withText(locs));
      },
    },
    {
      id: "lsp.hover",
      title: "Hover info (K)",
      async run() {
        const v = ed.activeView();
        const r = v && (await showHover(v));
        if (r === null) fail(noServer(ws.id, ed.current()?.path));
        else if (!r) say("No hover info here");
      },
    },
    {
      id: "lsp.rename",
      title: "Rename symbol",
      run() {
        const v = ed.activeView();
        if (!v || !hasLsp(v)) return fail(noServer(ws.id, ed.current()?.path));
        const w = v.state.wordAt(v.state.selection.main.head);
        if (!w) return fail("No symbol under the cursor");
        prompt("Rename to", v.state.sliceDoc(w.from, w.to), async (name) => {
          const paths = await ed.applyEdit((await renameAt(v, name)) ?? {});
          say(paths.length ? `Renamed in ${paths.length} files` : "Nothing to rename");
        });
      },
    },
    {
      id: "lsp.codeAction",
      title: "Code actions",
      async run() {
        const v = ed.activeView();
        const actions = v && (await codeActions(v, ws.id));
        if (!actions) return fail(noServer(ws.id, ed.current()?.path));
        if (!actions.length) return say("No code actions here");
        const byItem = new WeakMap<Item, CodeAction>();
        setPicker({
          title: "Code actions",
          async query(query) {
            const items = actions.map((a) => {
              const it = { label: a.title, hint: a.kind };
              byItem.set(it, a);
              return it;
            });
            return items.filter((it) => !query || it.label.toLowerCase().includes(query.toLowerCase()));
          },
          async pick(it) {
            try {
              const a = await resolveAction(v, byItem.get(it)!);
              if (a.edit) await ed.applyEdit(a.edit);
              if (a.command) await runCommand(v, a.command);
            } catch (e) {
              fail(errText(e));
            }
          },
        });
      },
    },
    {
      id: "lsp.symbols",
      title: "Symbols in file",
      async run() {
        const v = ed.activeView();
        const syms = v && (await documentSymbols(v, ws.root));
        if (!syms) return fail(noServer(ws.id, ed.current()?.path));
        setPicker(symbolPicker("Symbols in file", async () => syms, true));
      },
    },
    {
      id: "lsp.workspaceSymbols",
      title: "Symbols in project",
      run() {
        const v = ed.activeView();
        if (!v || !hasLsp(v)) return fail(noServer(ws.id, ed.current()?.path));
        setPicker(symbolPicker("Symbols in project", async (query) => (query.trim() ? (await workspaceSymbols(v, ws.root, query)) ?? [] : []), false));
      },
    },
    {
      id: "lsp.diagnostics",
      title: "Diagnostics in the folder",
      run() {
        const severity = ["", "error", "warning", "info", "hint"];
        const locs = diagnosticsFor(ws.id).all().flatMap((d): Loc[] => {
          const path = uriPath(ws.root, d.uri);
          if (path === null || path.startsWith("/")) return [];
          const text = `${severity[d.severity] ?? ""}: ${d.message.split("\n")[0]}`;
          return [{ path, line: d.line + 1, col: d.character, len: 0, text }];
        });
        if (!locs.length) return say("No diagnostics");
        q.set("Diagnostics", locs, false, false);
      },
    },
    { id: "lsp.nextDiagnostic", title: "Next diagnostic (]d)", run: () => onView(c, toDiagnostic(nextDiagnostic), "No diagnostics in this file") },
    { id: "lsp.prevDiagnostic", title: "Previous diagnostic ([d)", run: () => onView(c, toDiagnostic(previousDiagnostic), "No diagnostics in this file") },
  ];
}
