import { defineConfig } from "@playwright/test";
import { cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The server gets a fresh copy of testdata/e2e-ws, so tests can write to it. Workers load this file too, only the main process copies.
export const e2eWorkspace = join(tmpdir(), "ayaz-e2e-ws");
if (!process.env.TEST_WORKER_INDEX) {
  rmSync(e2eWorkspace, { recursive: true, force: true });
  cpSync("../testdata/e2e-ws", e2eWorkspace, { recursive: true });
}

// E2E against the Wails server build (no native window), in WebKit. Build it first: `task build:server`.
export default defineConfig({
  testDir: "e2e",
  use: { browserName: "webkit", baseURL: "http://127.0.0.1:34115" },
  webServer: {
    command: `../bin/ayaz-server --workspace ${e2eWorkspace}`,
    url: "http://127.0.0.1:34115",
    env: { WAILS_SERVER_HOST: "127.0.0.1", WAILS_SERVER_PORT: "34115" },
    reuseExistingServer: false,
  },
});
