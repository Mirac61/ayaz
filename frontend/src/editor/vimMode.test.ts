import { describe, expect, it, beforeEach } from "vitest";
import { isVim, setVim, toggleVim } from "../core/settings";
import { createState, editorExtensions, lineNumbersExtension, settingsEffects, vimExtensions } from "./editor";

describe("Vim mode and Standard mode configuration", () => {
  beforeEach(() => {
    setVim(true);
  });

  it("toggles vim mode via settings helpers", () => {
    expect(isVim()).toBe(true);
    expect(toggleVim()).toBe(false);
    expect(isVim()).toBe(false);
    expect(toggleVim()).toBe(true);
    expect(isVim()).toBe(true);
  });

  it("provides vim extensions when vim is enabled and empty extension when disabled", () => {
    expect(editorExtensions().length).toBeGreaterThan(0);
    const on = vimExtensions(true);
    expect(Array.isArray(on)).toBe(true);
    expect((on as unknown[]).length).toBeGreaterThan(0);

    const off = vimExtensions(false);
    expect(Array.isArray(off)).toBe(true);
    expect((off as unknown[]).length).toBe(0);
  });

  it("provides hybrid line numbers for vim and standard line numbers for non-vim", () => {
    const on = lineNumbersExtension(true);
    const off = lineNumbersExtension(false);
    expect(on).toBeDefined();
    expect(off).toBeDefined();
    expect(on).not.toBe(off);
  });

  it("creates editor state in vim and non-vim mode", async () => {
    setVim(true);
    const stateVim = await createState("test.ts", "const a = 1;");
    expect(stateVim.doc.toString()).toBe("const a = 1;");

    setVim(false);
    const stateStandard = await createState("test.ts", "const a = 1;");
    expect(stateStandard.doc.toString()).toBe("const a = 1;");
  });

  it("generates settingsEffects with compartments for dynamic reconfiguration", () => {
    const effects = settingsEffects("test.ts");
    expect(effects.length).toBeGreaterThanOrEqual(4);
  });
});
