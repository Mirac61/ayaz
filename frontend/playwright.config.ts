import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The server gets a fresh copy of testdata/e2e-ws, so tests can write to it. Workers load this file too, only the main process copies.
// The copy is committed in a repository one level up: the git gutter has a HEAD, and the tree no .git folder.
const repo = join(tmpdir(), "ayaz-e2e");
export const e2eWorkspace = join(repo, "ayaz-e2e-ws");
export const e2eConfig = join(tmpdir(), "ayaz-e2e-config"); // settings.json and keymap.json, empty at start
export const e2eCache = join(tmpdir(), "ayaz-e2e-cache"); // swaps (hot exit), not the user's
if (!process.env.TEST_WORKER_INDEX) {
  rmSync(repo, { recursive: true, force: true });
  rmSync(e2eConfig, { recursive: true, force: true });
  rmSync(e2eCache, { recursive: true, force: true });
  cpSync("../testdata/e2e-ws", e2eWorkspace, { recursive: true });
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args]);
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("-c", "user.name=e2e", "-c", "user.email=e2e@ayaz", "commit", "-q", "-m", "e2e");
}

// E2E against the Wails server build (no native window), in WebKit. Build it first: `task build:server`.
export default defineConfig({
  testDir: "e2e",
  // pdf.spec and terminal.spec each timed out once under load and never again in 7 runs (3 with all cores busy);
  // a retry shows such a run as "flaky" instead of failing the gate.
  retries: 1,
  // CI: the default "dot" reporter showed nothing for 10 minutes before the job was cancelled; "list" names the test that hangs.
  reporter: process.env.CI ? "list" : "line",
  globalTimeout: process.env.CI ? 15 * 60_000 : 0,
  // The tests share one server: after the first failures the rest fail too, each for 30 s plus a retry. Stop early.
  maxFailures: process.env.CI ? 3 : 0,
  use: { browserName: "webkit", baseURL: "http://127.0.0.1:34115" },
  // A saved config reaches every page of the shared server, so config.spec runs alone, after the rest.
  // swap.spec too: its unsaved files are offered back in every page that opens the folder meanwhile.
  projects: [
    { name: "main", testIgnore: /(config|swap|debug)\.spec/ },
    { name: "config", testMatch: /config\.spec/, dependencies: ["main"] },
    { name: "swap", testMatch: /swap\.spec/, dependencies: ["config"] },
    // Opt-in (AYAZ_DEBUG_E2E=1), and it adds a folder to the workspace, so it goes last.
    { name: "debug", testMatch: /debug\.spec/, dependencies: ["swap"] },
  ],
  webServer: {
    command: `../bin/ayaz-server --workspace ${e2eWorkspace}`,
    url: "http://127.0.0.1:34115",
    env: { WAILS_SERVER_HOST: "127.0.0.1", WAILS_SERVER_PORT: "34115", AYAZ_CONFIG_DIR: e2eConfig, AYAZ_CACHE_DIR: e2eCache },
    reuseExistingServer: false,
  },
});
