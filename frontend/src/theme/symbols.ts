import url from "./fonts/SymbolsNerdFontMono.woff2";

// Nerd Font icons (tree, tabs, shell prompts) without an installed Nerd Font: the symbols-only font, MIT
// (fonts/SymbolsNerdFont-LICENSE), last in --font-mono. Only the private use areas and the few symbols Nerd Fonts
// adds, so it never replaces a letter. Added from here, not tokens.css: WebKit may not know a CSS face yet at start.
let loading: Promise<unknown> | null = null; // once: StrictMode runs the effect that asks twice

export function symbolsFont(): Promise<unknown> {
  if (loading) return loading;
  const face = new FontFace("Ayaz Symbols", `url(${url})`, {
    unicodeRange: "U+E000-F8FF, U+F0000-FFFFD, U+23FB-23FE, U+2665, U+26A1, U+2B58",
  });
  document.fonts.add(face);
  return (loading = face.load().catch(() => {})); // without it the icons show as boxes, nothing else breaks
}
