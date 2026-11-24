import { expect, test, vi } from "vitest";

// A socket that is already OPEN but hasn't run onopen yet: the moment a pane resize can slip in.
const sock = {
  readyState: 1,
  binaryType: "",
  sent: [] as unknown[],
  send(d: unknown) {
    this.sent.push(d);
  },
  close() {},
} as {
  readyState: number;
  binaryType: string;
  sent: unknown[];
  send(d: unknown): void;
  close(): void;
  onopen?: () => void;
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

// A hidden terminal gives its WebGL canvas back and gets it again, with its text intact.
test("gpu(false) drops the WebGL canvas, gpu(true) brings it back", async () => {
  const el = document.createElement("div");
  el.style.cssText = "width:400px;height:200px";
  document.body.append(el);
  const h = openTerminal(el, { renderer: "webgl" });
  const canvases = () => el.querySelectorAll(".xterm-screen canvas").length;
  const withGl = canvases();
  await new Promise<void>((r) => h.term.write("hello", r));
  h.gpu(false);
  expect(withGl).toBeGreaterThan(0);
  expect(canvases()).toBe(0);
  h.gpu(true);
  h.gpu(true); // twice is no second context
  expect(canvases()).toBe(withGl);
  expect(h.term.buffer.active.getLine(0)?.translateToString(true)).toBe("hello");
  h.dispose();
  el.remove();
});
