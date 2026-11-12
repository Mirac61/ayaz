import { describe, it, expect } from "vitest";

describe("cmdline logic", () => {
  it("normalizes ex command prefixes", () => {
    const cleanEx = (raw: string) => {
      const trimmed = raw.trim();
      return trimmed.startsWith(":") ? trimmed.slice(1) : trimmed;
    };
    expect(cleanEx(":w")).toBe("w");
    expect(cleanEx(" :w! ")).toBe("w!");
    expect(cleanEx("wq")).toBe("wq");
    expect(cleanEx(":%s/foo/bar/g")).toBe("%s/foo/bar/g");
  });

  it("handles history navigation bounds", () => {
    const history = ["w", "q", "checkupdate"];
    let idx = -1;

    // Up arrow: older commands
    idx = Math.min(history.length - 1, idx + 1);
    expect(history[idx]).toBe("w");

    idx = Math.min(history.length - 1, idx + 1);
    expect(history[idx]).toBe("q");

    // Down arrow: newer commands
    idx = Math.max(-1, idx - 1);
    expect(history[idx]).toBe("w");

    idx = Math.max(-1, idx - 1);
    expect(idx).toBe(-1);
  });
});
