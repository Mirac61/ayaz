import { describe, expect, it, vi, beforeEach } from "vitest";
import { updaterStore } from "./updater";
import { backend, type UpdateInfo } from "./backend";

describe("updaterStore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("checks for updates and transitions to available", async () => {
    const mockInfo: UpdateInfo = {
      available: true,
      currentVersion: "0.2.1",
      latestVersion: "0.2.2",
      releaseNotes: "New features and fixes",
      publishedAt: "2026-11-12 18:00:00",
      filename: "ayaz-macos-arm64.zip",
      assetSize: 15_000_000,
    };

    vi.spyOn(backend, "checkUpdate").mockResolvedValueOnce(mockInfo);

    let notified = false;
    const unsub = updaterStore.subscribe(() => {
      notified = true;
    });

    const res = await updaterStore.check(true);
    expect(res).toEqual(mockInfo);
    expect(updaterStore.state).toBe("available");
    expect(updaterStore.info).toEqual(mockInfo);
    expect(notified).toBe(true);

    unsub();
  });

  it("handles up-to-date state correctly", async () => {
    const mockInfo: UpdateInfo = {
      available: false,
      currentVersion: "0.2.1",
      latestVersion: "0.2.1",
      releaseNotes: "",
      publishedAt: "",
      filename: "",
      assetSize: 0,
    };

    vi.spyOn(backend, "checkUpdate").mockResolvedValueOnce(mockInfo);

    const res = await updaterStore.check(false);
    expect(res?.available).toBe(false);
    expect(updaterStore.state).toBe("idle");
  });

  it("triggers download and install", async () => {
    const downloadSpy = vi.spyOn(backend, "downloadAndInstallUpdate").mockResolvedValueOnce();

    await updaterStore.download();
    expect(downloadSpy).toHaveBeenCalled();
  });

  it("triggers restart", async () => {
    const restartSpy = vi.spyOn(backend, "restartApp").mockResolvedValueOnce();

    await updaterStore.restart();
    expect(restartSpy).toHaveBeenCalled();
  });
});
