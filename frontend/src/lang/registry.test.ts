import { expect, test } from "vitest";
import { loadLanguage, serverFor } from "./registry";

test("every listed extension loads a parser that parses a line", async () => {
  const files = ["a.py", "a.rs", "a.yaml", "a.yml", "a.toml", "a.sh", "a.zsh", "a.sql", "a.xml", "a.php", "a.lua", "Dockerfile", "a.typ", "a.tex"];
  for (const f of files) {
    const lang = await loadLanguage(f);
    expect(lang, f).not.toBeNull();
    expect(lang!.language.parser.parse("x = 1\n").length, f).toBe(6);
  }
});

test("typst: headings, code, math and comments get their own tokens", async () => {
  const tree = (await loadLanguage("a.typ"))!.language.parser.parse("= Title\n#let x = 1 // note\n$ a + b $\n");
  const seen = new Set<string>();
  tree.iterate({ enter: (n) => void seen.add(n.name) });
  expect(seen.has("heading")).toBe(true);
  expect(seen.has("keyword")).toBe(true);
  expect(seen.has("comment")).toBe(true);
  expect(seen.has("atom")).toBe(true);
});

test("language servers for the new languages", () => {
  expect(serverFor("a.py")).toEqual(["python", "pyright"]);
  expect(serverFor("a.pyi")).toEqual(["python", "pyright"]);
  expect(serverFor("src/main.rs")).toEqual(["rust", "rust-analyzer"]);
  expect(serverFor("ci.yml")).toEqual(["yaml", "yaml"]);
  expect(serverFor("config.yaml")).toEqual(["yaml", "yaml"]);
  expect(serverFor("Cargo.toml")).toEqual(["toml", "taplo"]);
  expect(serverFor("init.lua")).toEqual(["lua", "lua-language-server"]);
  expect(serverFor("Dockerfile")).toEqual(["dockerfile", "dockerfile"]);
  expect(serverFor("Dockerfile.dev")).toEqual(["dockerfile", "dockerfile"]);
  expect(serverFor("Containerfile")).toEqual(["dockerfile", "dockerfile"]);
  expect(serverFor("a.typ")?.[1]).toBe("tinymist");
  expect(serverFor("a.tex")?.[1]).toBe("texlab");
  expect(serverFor("a.sh")).toBeUndefined();
});

test("a file without an extension is found by its name", async () => {
  expect(await loadLanguage("build/Dockerfile")).not.toBeNull();
  expect(await loadLanguage("build/Dockerfile.dev")).not.toBeNull();
  expect(await loadLanguage("Containerfile")).not.toBeNull();
  expect(await loadLanguage("Makefile")).toBeNull();
});
