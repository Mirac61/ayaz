import { describe, it, expect } from "vitest";
import { isEx } from "./setup";

describe("vim ex parser", () => {
  it("identifies quit and save commands as Ex", () => {
    expect(isEx("qa")).toBe(true);
    expect(isEx("qa!")).toBe(true);
    expect(isEx("qall!")).toBe(true);
    expect(isEx("wqa")).toBe(true);
    expect(isEx("xa")).toBe(true);
    expect(isEx("wa")).toBe(true);
    expect(isEx("w!")).toBe(true);
    expect(isEx("q!")).toBe(true);
  });
});
