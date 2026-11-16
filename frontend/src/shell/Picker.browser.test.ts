import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { Picker, type PickerSource } from "./Picker";

// Project search resolves at once with [] and streams its hits through update: Enter must pick from those.
test("Enter picks the cursor row of a streamed list", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const pick = vi.fn();
  const source: PickerSource = {
    title: "Search",
    initial: "TODO",
    query(q, update) {
      if (q) {
        setTimeout(() => update([{ label: "a.go:1: TODO" }, { label: "b.go:2: TODO" }]), 10);
      }
      return Promise.resolve([]);
    },
    pick,
  };
  createRoot(host).render(createElement(Picker, { source, onClose() {} }));
  await vi.waitFor(() => expect(host.querySelectorAll(".picker-item").length).toBe(2));
  const key = (k: string) =>
    host.querySelector(".picker-input")!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  key("ArrowDown");
  await vi.waitFor(() => expect(host.querySelector('[aria-selected="true"]')?.textContent).toContain("b.go"));
  key("Enter");
  await vi.waitFor(() => expect(pick).toHaveBeenCalledWith(expect.objectContaining({ label: "b.go:2: TODO" }), 1, false));
});

// Cmd/Ctrl+Enter before the first answer arrived must still reach pick as "side".
test("an early Cmd+Enter keeps its modifier", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const pick = vi.fn();
  const source: PickerSource = {
    title: "Early",
    query: () => new Promise((r) => setTimeout(() => r([{ label: "only" }]), 300)),
    pick,
  };
  createRoot(host).render(createElement(Picker, { source, onClose() {} }));
  await vi.waitFor(() => expect(host.querySelector(".picker-input")).not.toBeNull());
  host
    .querySelector(".picker-input")!
    .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
  await vi.waitFor(() => expect(pick).toHaveBeenCalledWith(expect.objectContaining({ label: "only" }), 0, true));
});
