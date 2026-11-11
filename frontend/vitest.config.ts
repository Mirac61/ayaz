import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

// Two projects: *.test.ts runs in Node, *.browser.test.ts in Playwright WebKit (close to WKWebView/WebKitGTK).
export default defineConfig({
  test: {
    projects: [
      { test: { name: "node", include: ["src/**/*.test.ts"], exclude: ["src/**/*.browser.test.ts"] } },
      {
        define: { __CI__: !!process.env.CI },
        test: {
          name: "browser",
          retry: process.env.CI ? 2 : 0, // key-press races on a loaded runner; locally a flake should stay visible
          include: ["src/**/*.browser.test.ts"],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: "webkit" }] },
        },
      },
    ],
  },
});
