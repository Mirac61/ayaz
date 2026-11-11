// Harpoon commands: <Space>a to mark, <Space>1..4 to jump, <Space>fa for the picker.
import type { Command } from "../../core/commands";
import { loadHarpoon, toggleHarpoon } from "../../core/harpoon";
import { fileIcon } from "../../theme/icons";
import type { Ctx } from "./context";

export function harpoonCommands(c: Ctx): Command[] {
  const gotoSlot = (slot: number) => () => {
    const items = loadHarpoon(c.ws.root);
    const path = items[slot - 1];
    if (!path) return c.say(`Harpoon slot ${slot} is empty (pin with <Space>a)`);
    c.run("file.open", path);
  };

  return [
    {
      id: "harpoon.toggle",
      title: "Harpoon: mark or unmark current file (<Space>a)",
      run() {
        const buf = c.ed.current();
        if (!buf || !buf.path || buf.path.startsWith("/") || buf.path.startsWith("term://") || buf.path.startsWith("debug://")) {
          return c.fail("Only workspace files can be harpooned");
        }
        const name = buf.path.slice(buf.path.lastIndexOf("/") + 1);
        const res = toggleHarpoon(c.ws.root, buf.path);
        c.say(res.added ? `Harpoon #${res.index}: ${name}` : `Removed from Harpoon: ${name}`);
      },
    },
    {
      id: "harpoon.menu",
      title: "Harpoon: show pinned files (<Space>fa, :harpoon)",
      run() {
        const items = loadHarpoon(c.ws.root);
        if (!items.length) return c.say("No harpooned files yet (pin with <Space>a)");
        c.setPicker({
          title: "Harpoon",
          async query(q) {
            const list = items.map((p, idx) => ({
              label: `${idx + 1}  ${p}`,
              hint: `Slot ${idx + 1}`,
              path: p,
              icon: fileIcon(p),
            }));
            return !q ? list : list.filter((it) => it.label.toLowerCase().includes(q.toLowerCase()));
          },
          pick(it) {
            c.run("file.open", (it as unknown as { path: string }).path);
          },
        });
      },
    },
    { id: "harpoon.goto1", title: "Harpoon: jump to slot 1 (<Space>1)", run: gotoSlot(1) },
    { id: "harpoon.goto2", title: "Harpoon: jump to slot 2 (<Space>2)", run: gotoSlot(2) },
    { id: "harpoon.goto3", title: "Harpoon: jump to slot 3 (<Space>3)", run: gotoSlot(3) },
    { id: "harpoon.goto4", title: "Harpoon: jump to slot 4 (<Space>4)", run: gotoSlot(4) },
  ];
}
