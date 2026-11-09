import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { mountImage } from "./image";
import { viewerFor } from "../core/viewers";

const svg = (w: number, h: number) =>
  "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="red"/></svg>`);

let el: HTMLElement;
afterEach(() => el?.remove());

function mount(url: string) {
  el = document.createElement("div");
  el.style.cssText = "position:relative;width:400px;height:300px";
  document.body.append(el);
  const h = mountImage(el, { url, onStatus: () => {} });
  h.focus();
  return h;
}

test("viewerFor: images only", () => {
  for (const p of ["a.png", "b/c.JPG", "d.jpeg", "e.gif", "f.webp", "g.svg"]) expect(viewerFor(p)?.id).toBe("image");
  expect(viewerFor("a.go")).toBeUndefined();
});

test("fit, zoom, 100 %, pan, dispose", async () => {
  const h = mount(svg(800, 600));
  await vi.waitFor(() => expect(h.status()).toBe("50% fit  800×600"));
  await userEvent.keyboard("+");
  expect(h.status()).toBe("63%  800×600");
  await userEvent.keyboard("1");
  expect(h.status()).toBe("100%  800×600");
  const img = el.querySelector("img")!;
  const before = img.style.transform;
  await userEvent.keyboard("l");
  expect(img.style.transform).not.toBe(before);
  await userEvent.keyboard("0");
  expect(h.status()).toBe("50% fit  800×600");
  h.dispose();
  expect(el.children.length).toBe(0);
});

test("small images stay at 100 % and centered", async () => {
  const h = mount(svg(100, 50));
  await vi.waitFor(() => expect(h.status()).toBe("100% fit  100×50"));
  expect(el.querySelector("img")!.style.transform).toBe("translate(150px, 125px) scale(1)");
  await userEvent.keyboard("hjkl"); // nothing to pan
  expect(el.querySelector("img")!.style.transform).toBe("translate(150px, 125px) scale(1)");
});

test("a broken image says so", async () => {
  const h = mount("data:image/png;base64,AAAA");
  await vi.waitFor(() => expect(h.status()).toBe("can't show this image"));
});
