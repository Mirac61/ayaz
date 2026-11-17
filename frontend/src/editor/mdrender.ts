import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { backend } from "../core/backend";
import { MD_SKINS, settings } from "../core/settings";
import { browsable, imageSrc, isReading, mdImages, resolveLink } from "./mdlive";
import "./mdskins.css";

// The reading view of a Markdown file as rendered HTML, raw HTML included (README badges, <p align="center">), in a skin.
// It sits over the editor of the pane while the reading view is on and follows the buffer; the live view stays for writing.

export const SKINS = MD_SKINS;
export type Skin = (typeof SKINS)[number];

// The skin command's choice survives restarts, until settings.json names another skin than the one it was picked over.
const SKIN_KEY = "ayaz.mdskin";
const boxes = new Set<HTMLElement>();
export function skin(): Skin {
  const file = settings().markdownSkin;
  try {
    const saved = JSON.parse(localStorage.getItem(SKIN_KEY) ?? "null") as { pick: Skin; file: Skin } | null;
    return saved?.file === file && SKINS.includes(saved.pick) ? saved.pick : file;
  } catch {
    return file;
  }
}
export function setSkin(s: Skin) {
  try {
    localStorage.setItem(SKIN_KEY, JSON.stringify({ pick: s, file: settings().markdownSkin }));
  } catch {
    /* convenience: the skin then lasts until the next redraw */
  }
  for (const b of boxes) {
    b.dataset.skin = s;
  }
}

// Scrolls view's reading view to the Markdown heading with this text; nth counts headings of the same text before it.
// False when no reading view shows it. By id, not by index: raw HTML headings (<h1 align="center">) have none.
export function revealHeading(view: EditorView, text: string, nth = 0): boolean {
  const box = [...boxes].find((b) => view.dom.contains(b));
  const h = box?.querySelectorAll(`[id="${CSS.escape(slug(text))}"]`)[nth];
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
md.renderer.rules.heading_open = (tokens, i, o, _env, self) => {
  tokens[i].attrSet("id", slug(tokens[i + 1]?.content ?? ""));
  return self.renderToken(tokens, i, o);
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
