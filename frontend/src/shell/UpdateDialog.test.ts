import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { UpdateDialog } from "./UpdateDialog";
import { updaterStore } from "../core/updater";

describe("UpdateDialog", () => {
  const mockInfo = {
    available: true,
    currentVersion: "0.3.1",
    latestVersion: "0.3.2",
    releaseNotes: "## Changes\n\n* Refined update dialog in https://github.com/Mirac61/ayaz/pull/42",
    publishedAt: "2026-11-13",
    filename: "ayaz.zip",
    assetSize: 7_500_000,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders ready state cleanly without emojis and with markdown notes", () => {
    vi.spyOn(updaterStore, "info", "get").mockReturnValue(mockInfo);
    vi.spyOn(updaterStore, "state", "get").mockReturnValue("ready");
    vi.spyOn(updaterStore, "error", "get").mockReturnValue(null);

    const html = renderToString(createElement(UpdateDialog, { onClose: () => {} }));
    // Verify no rocket emoji
    expect(html).not.toContain("🚀");
    // Verify no unicode checkmark
    expect(html).not.toContain("✓");
    // Verify Ayaz logo is present
    expect(html).toContain("update-dialog-logo");
    // Verify markdown rendered into rich HTML
    expect(html).toContain("<h2>Changes</h2>");
    expect(html).toContain("href=\"https://github.com/Mirac61/ayaz/pull/42\"");
    // Verify status card with dot
    expect(html).toContain("update-dialog-status-card ready");
    expect(html).toContain("status-dot ready");
    expect(html).toContain("Restart Ayaz");
  });

  it("renders downloading progress cleanly", () => {
    vi.spyOn(updaterStore, "info", "get").mockReturnValue(mockInfo);
    vi.spyOn(updaterStore, "state", "get").mockReturnValue("downloading");
    vi.spyOn(updaterStore, "progress", "get").mockReturnValue({
      percent: 45,
      written: 3_375_000,
      total: 7_500_000,
    });
    vi.spyOn(updaterStore, "error", "get").mockReturnValue(null);

    const html = renderToString(createElement(UpdateDialog, { onClose: () => {} }));
    expect(html).toContain("update-dialog-progress-bar-fill");
    expect(html).toContain("45%");
    expect(html).toContain("3.2 MB / 7.2 MB");
    expect(html).not.toContain("🚀");
  });

  it("renders error state cleanly without warning emoji", () => {
    vi.spyOn(updaterStore, "info", "get").mockReturnValue(mockInfo);
    vi.spyOn(updaterStore, "state", "get").mockReturnValue("error");
    vi.spyOn(updaterStore, "error", "get").mockReturnValue("Network timeout");

    const html = renderToString(createElement(UpdateDialog, { onClose: () => {} }));
    expect(html).toContain("update-dialog-status-card error");
    expect(html).toContain("status-dot error");
    expect(html).toContain("Network timeout");
    expect(html).not.toContain("⚠");
    expect(html).toContain("Retry");
  });
});
