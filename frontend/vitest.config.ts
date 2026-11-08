import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

// Two projects: *.test.ts runs in Node, *.browser.test.ts in Playwright WebKit (close to WKWebView/WebKitGTK).
export default defineConfig({
  test: {
    projects: [
      { test: { name: "node", include: ["src/**/*.test.ts"], exclude: ["src/**/*.browser.test.ts"] } },
      {
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: "webkit" }] },
        },
      },
    ],
  },
});
