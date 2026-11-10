import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The server gets a fresh copy of testdata/e2e-ws, so tests can write to it. Workers load this file too, only the main process copies.
// The copy is committed in a repository one level up: the git gutter has a HEAD, and the tree no .git folder.
const repo = join(tmpdir(), "ayaz-e2e");
export const e2eWorkspace = join(repo, "ayaz-e2e-ws");
if (!process.env.TEST_WORKER_INDEX) {
  rmSync(repo, { recursive: true, force: true });
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
  use: { browserName: "webkit", baseURL: "http://127.0.0.1:34115" },
  webServer: {
    command: `../bin/ayaz-server --workspace ${e2eWorkspace}`,
    url: "http://127.0.0.1:34115",
    env: { WAILS_SERVER_HOST: "127.0.0.1", WAILS_SERVER_PORT: "34115" },
    reuseExistingServer: false,
  },
});
