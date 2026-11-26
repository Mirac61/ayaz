import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wails from "@wailsio/runtime/plugins/vite";
import type { Plugin } from "vite";

// pdf.js styles global names Ayaz uses too (.sidebar got its radius, shadow and 239px width), and :root.
// Its sheet is nested inside the viewer box here, at build time, so the minifier flattens it for older WebViews.
// :where keeps the specificity, so viewers/pdf.css still overrides it.
const scopePdfCss: Plugin = {
  name: "ayaz:scope-pdfjs-css",
  enforce: "pre",
  transform(code, id) {
    if (!id.split("?")[0].endsWith("pdfjs-dist/web/pdf_viewer.css")) {
      return;
    }
    // pdf.js sets this one on <html> at runtime; a default on the viewer box would hide it
    const css = code.replace(/--viewer-container-height:[^;]*;/, "").replaceAll(":root", "&");
    return { code: `:where(.pdf-viewer) {\n${css}\n}`, map: null };
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  plugins: [scopePdfCss, react(), wails("./bindings")],
});
