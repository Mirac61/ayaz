import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { backend } from "../core/backend";
import { cachedSvg, fenceKind, renderSvg, svgSize, svgUrl, type DiagramKind } from "../core/diagram";
import { MD_SKINS, settings } from "../core/settings";
import { browsable, imageSrc, isReading, mdImages, resolveLink } from "./mdlive";
import "./mdskins.css";

// The reading view of a Markdown file as rendered HTML, raw HTML included (README badges, <p align="center">), in a skin.
// It sits over the editor of the pane while the reading view is on and follows the buffer; the live view stays for writing.

export const SKINS = MD_SKINS;
export type Skin = (typeof SKINS)[number];

// The skin command's choice survives restarts, until settings.json names another skin than the one it was picked over.
// A preview (the picker's cursor) is only shown: closing the window mid-preview keeps the skin that was picked.
const SKIN_KEY = "ayaz.mdskin";
const boxes = new Set<HTMLElement>();
type Picked = { pick: Skin; file: Skin };
let preview: Skin | null = null; // the picker's cursor, this session only
let session: Picked | null = null; // the last pick, so a blocked localStorage still keeps it until the next start

const stored = (): Picked | null => {
  try {
    const v = JSON.parse(localStorage.getItem(SKIN_KEY) ?? "null") as Picked | null;
    return v && SKINS.includes(v.pick) ? v : null;
  } catch {
    return null; // blocked or broken: settings.json decides
  }
};
export function skin(): Skin {
  if (preview) {
    return preview;
  }
  const file = settings().markdownSkin,
    pick = stored() ?? session; // session only exists when storage is blocked, so it never competes with a stored pick
  return pick?.file === file ? pick.pick : file;
}

const paint = () => {
  const s = skin();
  for (const b of boxes) {
    b.dataset.skin = s;
  }
};

// The picker's cursor tries a skin on every open reading view; null goes back to the picked one.
export function previewSkin(s: Skin | null) {
  preview = s;
  paint();
}

export function setSkin(s: Skin) {
  preview = null;
  const picked = { pick: s, file: settings().markdownSkin };
  try {
    localStorage.setItem(SKIN_KEY, JSON.stringify(picked));
    session = null;
  } catch {
    session = picked; // no storage: the pick still lasts this session
  }
  paint();
}

// Scrolls view's reading view to its nth Markdown heading (the outline's index); false when no reading view shows it.
// By index, not by text: two titles can share a slug, and raw HTML can bring its own id (<h1 align="center">).
export function revealHeading(view: EditorView, index: number): boolean {
  const box = [...boxes].find((b) => view.dom.contains(b));
  const h = box?.querySelector(`[data-md-heading="${index}"]`);
  h?.scrollIntoView({ block: "start" });
  return !!h;
}

// Opens a workspace file a link points at; the shell sets it.
export const mdLinks = { open: (_path: string) => {} };

const slug = (t: string) =>
  t
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

const md = new MarkdownIt({ html: true, linkify: true });
// Duplicate titles get "…-1", "…-2" like on GitHub. data-md-heading is the heading's place among the document's
// headings, so the outline can scroll by index: two titles can share a slug, raw HTML can carry its own id.
md.core.ruler.after("inline", "headings", ({ tokens }) => {
  const ids = new Map<string, number>();
  let n = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== "heading_open") {
      continue;
    }
    const content = tokens[i + 1]?.content ?? "",
      base = slug(content),
      seen = ids.get(base) ?? 0;
    ids.set(base, seen + 1);
    tokens[i].attrSet("id", seen ? `${base}-${seen}` : base);
    if (content.trim()) {
      // an empty heading ("#") is no outline entry, and skipping it keeps the indexes in step with the outline
      tokens[i].attrSet("data-md-heading", String(n++));
    }
  }
});
// ```mermaid and ```plantuml blocks are drawn after the HTML is in the page (drawDiagrams); the source stays until then.
const fence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, i, o, env, self) => {
  const kind = fenceKind(tokens[i].info);
  return kind
    ? `<div class="md-diagram" data-kind="${kind}"><pre>${md.utils.escapeHtml(tokens[i].content)}</pre></div>\n`
    : fence(tokens, i, o, env, self);
};
// "- [ ] x" and "- [x] x" are checkboxes, like on GitHub.
md.core.ruler.after("inline", "tasks", (state) => {
  const t = state.tokens;
  for (let i = 2; i < t.length; i++) {
    const first = t[i].type === "inline" && t[i - 2].type === "list_item_open" ? t[i].children?.[0] : undefined;
    const m = first?.type === "text" && /^\[([ xX])\] /.exec(first.content);
    if (!first || !m) {
      continue;
    }
    const box = new state.Token("html_inline", "", 0);
    box.content = `<input type="checkbox" disabled${m[1] === " " ? "" : " checked"}> `;
    first.content = first.content.slice(m[0].length);
    t[i].children!.unshift(box);
    t[i - 2].attrJoin("class", "task");
  }
});

// Markdown → a DocumentFragment of sanitized HTML. Relative images point into the workspace; links are marked for the click handler.
export function renderMarkdown(text: string, ctx: { ws: string; file: string } | null): HTMLTemplateElement {
  const t = document.createElement("template");
  t.innerHTML = DOMPurify.sanitize(md.render(text), { FORBID_ATTR: ["style"], FORBID_TAGS: ["style", "form"] });
  for (const img of t.content.querySelectorAll("img")) {
    const src = ctx && imageSrc(ctx.ws, ctx.file, img.getAttribute("src") ?? "");
    if (src) {
      img.setAttribute("src", src);
    }
  }
  return t;
}

// Replaces each diagram block's source by its picture; a failure shows the message under the source.
export function drawDiagrams(root: ParentNode) {
  for (const box of root.querySelectorAll<HTMLElement>(".md-diagram")) {
    const src = box.querySelector("pre")?.textContent ?? "";
    const kind = box.dataset.kind as DiagramKind;
    const show = (svg: string) =>
      box.replaceChildren(
        Object.assign(document.createElement("img"), { src: svgUrl(svg), alt: `${kind} diagram`, ...svgSize(svg) }),
      );
    // Already drawn: put it in at once, so the redraw after typing keeps its height and the scroll position.
    const ready = cachedSvg(kind, src);
    if (ready !== undefined) {
      show(ready);
      continue;
    }
    renderSvg(kind, src).then(
      (svg) => {
        if (box.isConnected) {
          show(svg);
        }
      },
      (e) => {
        if (box.isConnected) {
          box.classList.add("error");
          box.append(
            Object.assign(document.createElement("p"), { className: "md-diagram-error", textContent: String(e?.message ?? e) }),
          );
        }
      },
    );
  }
}

function onClick(e: MouseEvent, box: HTMLElement, ctx: { ws: string; file: string } | null) {
  const a = (e.target as HTMLElement).closest("a");
  if (!a) {
    return;
  }
  e.preventDefault();
  const href = a.getAttribute("href") ?? "";
  if (href.startsWith("#")) {
    box.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)?.scrollIntoView();
  } else if (browsable(href)) {
    void backend.openURL(href);
  } else if (ctx) {
    const p = resolveLink(ctx.file, href);
    if (p) {
      mdLinks.open(p);
    }
  }
}

class Render {
  box: HTMLElement | null = null;
  timer = 0;
  constructor(readonly view: EditorView) {
    this.sync();
  }

  update(u: ViewUpdate) {
    const on = isReading(u.state);
    if (on !== isReading(u.startState)) {
      this.sync();
    } else if (on && u.docChanged) {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.draw(), 120);
    }
  }

  sync() {
    if (!isReading(this.view.state)) {
      return this.destroy();
    }
    if (!this.box) {
      this.box = Object.assign(document.createElement("div"), { className: "md-render" });
      this.box.append(Object.assign(document.createElement("div"), { className: "md-body" }));
      this.box.addEventListener("click", (e) => onClick(e, this.box!, this.view.state.facet(mdImages)));
      this.view.dom.append(this.box);
      boxes.add(this.box);
    }
    this.draw();
  }

  draw() {
    const body = this.box?.firstElementChild;
    if (!this.box || !body) {
      return;
    }
    this.box.dataset.skin = skin();
    const top = this.box.scrollTop; // a redraw while typing in the source pane keeps the place
    body.replaceChildren(renderMarkdown(this.view.state.doc.toString(), this.view.state.facet(mdImages)).content);
    drawDiagrams(body);
    this.box.scrollTop = top;
  }

  destroy() {
    clearTimeout(this.timer);
    if (this.box) {
      boxes.delete(this.box);
    }
    this.box?.remove();
    this.box = null;
  }
}

export const mdRender = ViewPlugin.fromClass(Render);
