import { afterEach, describe, expect, test, vi } from "vitest";
import { mountHtml, prepareHtml, resolveBaseUrl } from "./html";

let el: HTMLElement;
afterEach(() => el?.remove());

describe("html preview browser", () => {
  test("mountHtml renders iframe with live content, injects base href for fragments, and updates on reload", () => {
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
    // Fragment HTML gets base href injected
    expect(frame?.srcdoc).toBe('<base href="/fs/ws1/"><h1>Live HTML</h1>');
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts allow-forms allow-popups allow-modals");
    expect(frame?.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(handle.status()).toBe("preview: index.html");

    // Live update on reload
    content = "<h2>Updated HTML</h2>";
    handle.reload?.();
    expect(frame?.srcdoc).toBe('<base href="/fs/ws1/"><h2>Updated HTML</h2>');

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
    expect(frame?.srcdoc).toContain("<title>Test</title>");

    handle.dispose();
  });

  test("base tag inside an HTML comment does not suppress base injection", () => {
    const raw = '<!-- <base href="comment.html"> --><h1>Commented</h1>';
    const prepared = prepareHtml(raw, "/fs/ws1/index.html");
    expect(prepared).toBe('<base href="/fs/ws1/"><!-- <base href="comment.html"> --><h1>Commented</h1>');
  });

  test("resolves relative base href against ctx.url while preserving attributes", () => {
    const raw = '<html><head><base target="_blank" href="assets/"></head><body>Body</body></html>';
    const prepared = prepareHtml(raw, "/fs/ws1/sub/index.html");
    expect(prepared).toContain('<base target="_blank" href="/fs/ws1/sub/assets/">');

    const abs = '<html><head><base href="https://example.com/cdn/" target="_top"></head></html>';
    const preparedAbs = prepareHtml(abs, "/fs/ws1/sub/index.html");
    expect(preparedAbs).toBe(abs);
  });

  test("external browser button only opens http/https URLs, not /fs/ paths", () => {
    el = document.createElement("div");
    document.body.append(el);

    const openURL = vi.fn();
    const ctx = {
      url: "/fs/ws1/index.html",
      onStatus: () => {},
      openURL,
    };

    const handle = mountHtml(el, ctx);
    const openBtn = el.querySelectorAll<HTMLButtonElement>("button.ui-icon")[1];
    expect(openBtn?.getAttribute("aria-label")).toBe("Open in system browser");

    openBtn.click();
    expect(openURL).not.toHaveBeenCalled();

    handle.dispose();
  });

  test("resolveBaseUrl handles relative and absolute base paths", () => {
    expect(resolveBaseUrl("sub/", "/fs/ws1/index.html")).toBe("/fs/ws1/sub/");
    expect(resolveBaseUrl("../img.png", "/fs/ws1/sub/index.html")).toBe("/fs/ws1/img.png");
    expect(resolveBaseUrl("https://foo.com/x", "/fs/ws1/index.html")).toBe("https://foo.com/x");
    expect(resolveBaseUrl("assets/", "http://localhost:3000/docs/index.html")).toBe("http://localhost:3000/docs/assets/");
  });
});
