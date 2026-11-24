// Mermaid and PlantUML files: the diagram in the image viewer (zoom, pan), redrawn when the file changes.
import { diagramKind, errorSvg, renderSvg } from "../core/diagram";
import { registerViewer, type ViewContext, type ViewHandle } from "../core/viewers";
import { mountImage } from "./image";

const BLANK = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"/>';

export function mountDiagram(el: HTMLElement, ctx: ViewContext): ViewHandle {
  const kind = diagramKind(ctx.url)!;
  let svg = BLANK;
  // The image viewer shows `.svg` files from their live text: hand it the drawn SVG that way.
  const image = mountImage(el, { ...ctx, url: ctx.url + ".svg", getContent: () => svg });
  el.querySelector(".image-viewer")?.classList.add("diagram");
  let seq = 0,
    gone = false;
  const draw = async () => {
    const n = ++seq;
    const text =
      ctx.getContent?.() ??
      (await fetch(ctx.url).then(
        (r) => r.text(),
        () => null,
      ));
    const out =
      text === null
        ? errorSvg("can't read this file")
        : await renderSvg(kind, text).catch((e) => errorSvg(String(e?.message ?? e)));
    if (n === seq && !gone) {
      svg = out;
      image.reload?.();
    }
  };
  void draw();
  return {
    ...image,
    reload: () => void draw(),
    dispose: () => {
      gone = true;
      image.dispose();
    },
  };
}

registerViewer({ id: "diagram", exts: ["mmd", "mermaid", "puml", "plantuml", "pu"], mount: mountDiagram });
