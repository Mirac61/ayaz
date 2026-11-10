import { expect, test, vi } from "vitest";

// A socket that is already OPEN but hasn't run onopen yet: the moment a pane resize can slip in.
const sock = { readyState: 1, binaryType: "", sent: [] as unknown[], send(d: unknown) { this.sent.push(d); }, close() {} } as {
  readyState: number; binaryType: string; sent: unknown[]; send(d: unknown): void; close(): void; onopen?: () => void;
};
vi.mock("../core/backend", () => ({ backend: { stream: () => sock, openURL: () => {} } }));
const { openTerminal } = await import("./terminal");

// M38: Go reads the config as the first frame; a resize or a key before it ended the shell at once.
test("nothing goes to the shell before the config frame", () => {
  const el = document.createElement("div");
  el.style.cssText = "width:400px;height:200px";
  document.body.append(el);
  const h = openTerminal(el, { renderer: "dom" });
  h.term.resize(50, 10);
  h.input("x");
  sock.onopen?.();
  expect(typeof sock.sent[0]).toBe("string");
  expect(JSON.parse(sock.sent[0] as string)).toMatchObject({ cols: expect.any(Number), rows: expect.any(Number) });
  h.dispose();
  el.remove();
});
