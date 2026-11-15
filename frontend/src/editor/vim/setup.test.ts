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

  it("identifies git ex commands and shortcuts", () => {
    expect(isEx("Gpush")).toBe(true);
    expect(isEx("Gp")).toBe(true);
    expect(isEx("Gpull")).toBe(true);
    expect(isEx("Gpul")).toBe(true);
    expect(isEx("Gfetch")).toBe(true);
    expect(isEx("Gf")).toBe(true);
    expect(isEx("Grebase")).toBe(true);
    expect(isEx("Greb")).toBe(true);
    expect(isEx("Gwrite")).toBe(true);
    expect(isEx("Gw")).toBe(true);
    expect(isEx("Gcommit")).toBe(true);
    expect(isEx("Gc")).toBe(true);
    expect(isEx("Gvdiffsplit")).toBe(true);
    expect(isEx("Gvd")).toBe(true);
  });

  it("handles range and pattern syntax", () => {
    expect(isEx("%s/foo/bar/g")).toBe(true);
    expect(isEx("'<,'>d")).toBe(true);
    expect(isEx("1,5d")).toBe(true);
    expect(isEx(".+1,-1m$")).toBe(true);
  });

  it("distinguishes ordinary search terms from ex commands", () => {
    expect(isEx("find files")).toBe(false);
    expect(isEx("open folder")).toBe(false);
    expect(isEx("switch project")).toBe(false);
  });
});
