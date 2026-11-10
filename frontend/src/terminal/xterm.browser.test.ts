import { expect, test } from "vitest";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { terminalTheme } from "../theme/themes";

// xterm.js renders into a real WebKit DOM, without the Go backend.
test("xterm writes and renders text in WebKit", async () => {
  const el = document.createElement("div");
  el.style.cssText = "width:400px;height:200px";
  document.body.append(el);
  const term = new Terminal({ theme: terminalTheme() });
  term.open(el);
  await new Promise<void>((r) => term.write("hello ayaz", r));
  expect(term.buffer.active.getLine(0)?.translateToString(true)).toBe("hello ayaz");
  // the DOM renderer paints a frame later
  await expect.poll(() => el.querySelector(".xterm-rows")?.textContent).toContain("hello ayaz");
  term.dispose();
});
