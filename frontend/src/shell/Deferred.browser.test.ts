import { createElement as h, lazy, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { Deferred } from "./Deferred";

test("a dialog whose chunk fails to load closes; the rest stays mounted", async () => {
  const el = document.createElement("div");
  document.body.append(el);
  const onFail = vi.fn();
  const Broken = lazy<ComponentType>(() => Promise.reject(new Error("chunk gone")));
  const root = createRoot(el);
  root.render(h("main", null, "workspace", h(Deferred, { onFail, children: h(Broken) })));
  await vi.waitFor(() => expect(onFail).toHaveBeenCalled());
  expect(el.textContent).toBe("workspace");
  root.unmount();
  el.remove();
});
