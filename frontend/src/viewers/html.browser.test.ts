import { afterEach, describe, expect, test } from "vitest";
import { mountHtml } from "./html";

let el: HTMLElement;
afterEach(() => el?.remove());

describe("html preview browser", () => {
  test("mountHtml renders iframe with live content from getContent and updates on reload", () => {
    el = document.createElement("div");
    el.style.cssText = "position:relative;width:400px;height:300px";
    document.body.append(el);

    let content = "<h1>Live HTML</h1>";
    const ctx = {
      url: "/fs/ws1/index.html",
      onStatus: () => {},
      getContent: () => content,
    };

    const handle = mountHtml(el, ctx);
    const box = el.querySelector(".html-preview");
    expect(box).not.toBeNull();

    const frame = el.querySelector<HTMLIFrameElement>("iframe");
    expect(frame).not.toBeNull();
    expect(frame?.srcdoc).toBe("<h1>Live HTML</h1>");
    expect(handle.status()).toBe("preview: index.html");

    // Live update on reload
    content = "<h2>Updated HTML</h2>";
    handle.reload?.();
    expect(frame?.srcdoc).toBe("<h2>Updated HTML</h2>");

    handle.dispose();
    expect(el.children.length).toBe(0);
  });

  test("mountHtml renders browser badge and injects base href when head exists", () => {
    el = document.createElement("div");
    el.style.cssText = "position:relative;width:400px;height:300px";
    document.body.append(el);

    const content = "<!DOCTYPE html><html><head><title>Test</title></head><body>Hello</body></html>";
    const ctx = {
      url: "/fs/ws1/sub/page.html",
      onStatus: () => {},
      getContent: () => content,
    };

    const handle = mountHtml(el, ctx);
    const badge = el.querySelector(".html-preview-badge");
    expect(badge?.textContent).toBe("Browser");

    const frame = el.querySelector<HTMLIFrameElement>("iframe");
    expect(frame?.srcdoc).toContain('<base href="/fs/ws1/sub/">');

    handle.dispose();
  });
});
