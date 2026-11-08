import { defineConfig } from "@playwright/test";

// E2E against the Wails server build (no native window), in WebKit. Build it first: `task build:server`.
export default defineConfig({
  testDir: "e2e",
  use: { browserName: "webkit", baseURL: "http://127.0.0.1:34115" },
  webServer: {
    command: "../bin/ayaz-server",
    url: "http://127.0.0.1:34115",
    env: { WAILS_SERVER_HOST: "127.0.0.1", WAILS_SERVER_PORT: "34115" },
    reuseExistingServer: false,
  },
});
