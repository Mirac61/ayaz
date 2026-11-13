import { beforeEach, describe, expect, it } from "vitest";
import { recentFolders, rememberFolder } from "./folders";
import { availableThemes, setThemeOverride, themeName } from "../core/settings";

const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
};
Object.defineProperty(globalThis, "localStorage", { value: mockLocalStorage, writable: true });

const mockStyle = {
  setProperty: () => {},
  removeProperty: () => {},
};
const mockElement = {
  style: mockStyle,
  toggleAttribute: () => {},
};
Object.defineProperty(globalThis, "document", {
  value: {
    documentElement: mockElement,
  },
  writable: true,
});

describe("Welcome Screen & Bento Hub", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("manages and filters recent folders correctly", () => {
    expect(recentFolders()).toEqual([]);

    rememberFolder({ id: "1", name: "ayaz", root: "/Users/dev/ayaz" });
    rememberFolder({ id: "2", name: "website", root: "/Users/dev/website" });
    rememberFolder({ id: "3", name: "api-server", root: "/Users/dev/api-server" });

    const recent = recentFolders();
    expect(recent).toHaveLength(3);
    expect(recent[0].name).toBe("api-server");

    // Test real-time filter logic
    const filter = (query: string) =>
      recent.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()) || f.root.toLowerCase().includes(query.toLowerCase()));

    expect(filter("ayaz")).toHaveLength(1);
    expect(filter("ayaz")[0].name).toBe("ayaz");

    expect(filter("dev")).toHaveLength(3);
    expect(filter("nonexistent")).toHaveLength(0);
  });

  it("supports live theme switching from the welcome palette", () => {
    const themes = availableThemes();
    expect(themes).toContain("ayaz-frost");
    expect(themes).toContain("nord");
    expect(themes).toContain("iceberg");
    expect(themes).toContain("poimandres");
    expect(themes).toContain("graphite");

    // Switching to nord
    const okNord = setThemeOverride("nord");
    expect(okNord).toBe(true);
    expect(themeName()).toBe("nord");

    // Switching to ayaz-frost
    const okFrost = setThemeOverride("ayaz-frost");
    expect(okFrost).toBe(true);
    expect(themeName()).toBe("ayaz-frost");

    // Invalid theme returns false and does not change active
    const okInvalid = setThemeOverride("non-existent-theme-xyz");
    expect(okInvalid).toBe(false);
    expect(themeName()).toBe("ayaz-frost");
  });

  it("correctly normalizes repository shorthand to git clone URLs", () => {
    const normalizeGitUrl = (raw: string) => {
      const url = raw.trim();
      if (!url) return "";
      if (url.includes("://") || url.startsWith("git@")) return url;
      if (url.includes("/") && url.split("/").length === 2) {
        return `https://github.com/${url}.git`;
      }
      return url;
    };

    expect(normalizeGitUrl("Mirac61/ayaz")).toBe("https://github.com/Mirac61/ayaz.git");
    expect(normalizeGitUrl("facebook/react")).toBe("https://github.com/facebook/react.git");
    expect(normalizeGitUrl("https://github.com/Mirac61/ayaz.git")).toBe("https://github.com/Mirac61/ayaz.git");
    expect(normalizeGitUrl("git@github.com:Mirac61/ayaz.git")).toBe("git@github.com:Mirac61/ayaz.git");
  });
});
