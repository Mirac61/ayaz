import { createRef, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import type { Files } from "../core/backend";
import { Tree, type TreeHandle } from "./Tree";

test('reveal of "./b.go" from a filtered tree leaves the filter and selects b.go without opening it', async () => {
  const style = document.createElement("style");
  style.textContent = ".tree { height: 300px; overflow: auto; } .tree-row { position: absolute; }";
  document.head.append(style);
  const host = document.body.appendChild(document.createElement("div"));
  const listed: Record<string, { name: string; dir: boolean }[]> = {
    "": [
      { name: "a.go", dir: false },
      { name: "b.go", dir: false },
    ],
  };
  const files = {
    list: async (dir: string) => listed[dir] ?? [],
    find: async () => [{ path: "a.go", positions: [] }], // the filter shows a.go only, "b.go" is no row of it
  } as unknown as Files;
  const onOpen = vi.fn();
  const ref = createRef<TreeHandle>();
  createRoot(host).render(createElement(Tree, { ref, files, onOpen, onLeave() {}, onCommand() {}, git: () => undefined }));

  await vi.waitFor(() => expect(host.querySelectorAll(".tree-row").length).toBe(2));
  host.querySelector<HTMLElement>(".tree")!.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }));
  await vi.waitFor(() => expect(host.querySelector(".tree-filter")).not.toBeNull());
  const box = host.querySelector<HTMLInputElement>(".tree-filter")!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(box, "a"); // an empty filter shows everything
  box.dispatchEvent(new Event("input", { bubbles: true }));
  await vi.waitFor(() => expect(host.querySelectorAll(".tree-row").length).toBe(1)); // filtered: a.go only

  await ref.current!.reveal("./b.go");
  await vi.waitFor(() => expect(host.querySelector(".tree-filter")).toBeNull());
  await new Promise((r) => setTimeout(r, 300)); // a late rows update must not pull the cursor back
  await vi.waitFor(() => expect(host.querySelector(".tree-row.cursor")?.textContent).toContain("b.go"));
  expect(onOpen).not.toHaveBeenCalled();
});
