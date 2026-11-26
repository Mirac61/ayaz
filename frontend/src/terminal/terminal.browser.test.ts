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
test("nothing goes to the shell before the config frame", async () => {
  const el = document.createElement("div");
  el.style.cssText = "width:400px;height:200px";
  document.body.append(el);
  const h = openTerminal(el, { renderer: "dom" });
  // "send line to terminal" can be faster than xterm and the shell: it waits
  h.input("early");
  // xterm loads behind openTerminal
  const term = await vi.waitFor(() => h.term);
  term.resize(50, 10);
  h.input("x");
  expect(sock.sent).toHaveLength(0);
  sock.onopen?.();
  await h.ready;
  expect(typeof sock.sent[0]).toBe("string");
  expect(JSON.parse(sock.sent[0] as string)).toMatchObject({ cols: expect.any(Number), rows: expect.any(Number) });
  // frame byte 0 is input
  const typed = await vi.waitFor(() => {
    const frames = (sock.sent.slice(1) as Uint8Array[]).filter((f) => f[0] === 0);
    expect(frames).toHaveLength(2);
    return frames.map((f) => new TextDecoder().decode(f.subarray(1)));
  });
  expect(typed).toEqual(["early", "x"]);
  h.dispose();
  el.remove();
});

test("closed before xterm loaded: ready rejects, later calls do nothing", async () => {
  const el = document.createElement("div");
  document.body.append(el);
  const h = openTerminal(el, { renderer: "dom" });
  h.focus();
  h.input("x");
  h.dispose();
  await expect(h.ready).rejects.toThrow("closed before");
  expect(el.childElementCount).toBe(0);
  el.remove();
});
