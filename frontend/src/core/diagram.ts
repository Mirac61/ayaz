import { backend } from "./backend";
import { extOf } from "../lang/registry";

// Mermaid and PlantUML text → SVG, for the diagram viewer and the ```mermaid / ```plantuml blocks of the reading view.
// Mermaid renders in the page (loaded on first use, it is large); PlantUML runs the installed `plantuml` through Go.

export type DiagramKind = "mermaid" | "plantuml";

// Maps, not objects: a ```constructor block must not find Object.prototype.constructor.
const FILES = new Map<string, DiagramKind>([
  ["mmd", "mermaid"],
  ["mermaid", "mermaid"],
  ["puml", "plantuml"],
  ["plantuml", "plantuml"],
  ["pu", "plantuml"],
]);
const FENCES = new Map<string, DiagramKind>([
  ["mermaid", "mermaid"],
  ["plantuml", "plantuml"],
  ["puml", "plantuml"],
]);

export const diagramKind = (path: string): DiagramKind | undefined => FILES.get(extOf(path));
export const fenceKind = (info: string): DiagramKind | undefined => FENCES.get(info.trim().split(/\s/)[0].toLowerCase());

type Mermaid = typeof import("mermaid").default;
let loaded: Promise<Mermaid> | undefined;
const mermaid = () =>
  (loaded ??= import("mermaid").then(({ default: m }) => {
    // Plain SVG text instead of HTML labels: the result is shown through <img>, which draws foreignObject unreliably.
    m.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });
    return m;
  }));

// mermaid.render is not re-entrant: one at a time.
let queue: Promise<unknown> = Promise.resolve();
let ids = 0;
const mermaidSvg = (text: string) => {
  const run = queue.then(async () => (await (await mermaid()).render(`mermaid-${++ids}`, text)).svg);
  queue = run.catch(() => {});
  return run;
};

// An <img> needs a pixel size: Mermaid writes width="100%" with a viewBox, which shows up as 300×150.
export function sized(svg: string): string {
  const vb = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!vb) {
    return svg;
  }
  return svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\s(width|height)="[^"]*"/g, "")
      .replace("<svg", `<svg width="${Math.ceil(+vb[1])}" height="${Math.ceil(+vb[2])}"`),
  );
}

const cache = new Map<string, Promise<string>>();
// the finished ones, for a redraw without a frame of source text
const done = new Map<string, string>();
const CACHE = 40;

export const cachedSvg = (kind: DiagramKind, text: string) => done.get(kind + "\0" + text);

// The pixel size in the <svg> tag: set on the <img>, it holds the room before the picture is decoded.
export function svgSize(svg: string): { width: number; height: number } | undefined {
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
  const w = /\swidth="([\d.]+)(?:px)?"/.exec(tag),
    h = /\sheight="([\d.]+)(?:px)?"/.exec(tag);
  return w && h ? { width: Math.round(+w[1]), height: Math.round(+h[1]) } : undefined;
}

// The SVG for source text; the same text again comes from the cache (the reading view redraws on every pause in typing).
export function renderSvg(kind: DiagramKind, text: string): Promise<string> {
  const key = kind + "\0" + text;
  let hit = cache.get(key);
  if (!hit) {
    hit = kind === "mermaid" ? mermaidSvg(text).then(sized) : backend.renderPlantUML(text);
    cache.set(key, hit);
    hit.then(
      (svg) => cache.has(key) && done.set(key, svg),
      // a failure (plantuml missing) is tried again next time
      () => cache.delete(key),
    );
    if (cache.size > CACHE) {
      const oldest = cache.keys().next().value!;
      cache.delete(oldest);
      done.delete(oldest);
    }
  }
  return hit;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// The message as a picture, for places that can only show an image.
export function errorSvg(message: string): string {
  const lines = message.split("\n").slice(0, 12);
  const h = 24 + lines.length * 18;
  const text = lines.map((l, i) => `<text x="12" y="${28 + i * 18}">${esc(l)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${h}"><rect width="100%" height="100%" fill="#fff"/><g font-family="monospace" font-size="13" fill="#b00020">${text}</g></svg>`;
}

export const svgUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
