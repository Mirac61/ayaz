import { describe, expect, it, beforeEach } from "vitest";
import { isVim, setVim, toggleVim } from "../core/settings";
import { createState, editorExtensions, lineNumbersCompartment, lineNumbersExtension, settingsEffects, vimCompartment, vimExtensions } from "./editor";

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

  it("settingsEffects switch an open editor between modes and keep the text", async () => {
    const hybrid = lineNumbersExtension(true);
    const vimState = await createState("test.ts", "const a = 1;");
    expect((vimCompartment.get(vimState) as unknown[]).length).toBeGreaterThan(0);
    expect(lineNumbersCompartment.get(vimState)).toBe(hybrid);

    setVim(false);
    const standard = vimState.update({ effects: settingsEffects("test.ts", vimState.doc) }).state;
    expect(vimCompartment.get(standard)).toEqual([]);
    expect(lineNumbersCompartment.get(standard)).not.toBe(hybrid);
    expect(standard.doc.toString()).toBe("const a = 1;");

    setVim(true);
    const back = standard.update({ effects: settingsEffects("test.ts", standard.doc) }).state;
    expect((vimCompartment.get(back) as unknown[]).length).toBeGreaterThan(0);
    expect(lineNumbersCompartment.get(back)).toBe(hybrid);
    expect(back.doc.toString()).toBe("const a = 1;");
  });
});
