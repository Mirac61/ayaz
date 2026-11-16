import { expect, test } from "vitest";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { terminalTheme } from "../theme/themes";
import { fileLinkProvider } from "./terminal";

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

test("a compiler line gets a file link that opens the file at the position", async () => {
  const el = document.createElement("div");
  document.body.append(el);
  const term = new Terminal({ theme: terminalTheme() });
  term.open(el);
  await new Promise<void>((r) => term.write("src/a.go:3:1: boom", r));
  const opened: unknown[][] = [];
  const links = await new Promise<{ range: unknown; activate(e: MouseEvent, t: string): void }[] | undefined>((r) =>
    fileLinkProvider(term, (...a) => opened.push(a)).provideLinks(1, r));
  expect(links).toHaveLength(1);
  expect(links![0].range).toEqual({ start: { x: 1, y: 1 }, end: { x: 12, y: 1 } });
  links![0].activate(new MouseEvent("click"), "src/a.go:3:1");
  expect(opened).toEqual([["src/a.go", 3, 1]]);
  term.dispose();
});
